"""Text and vision inference over the signed-in Codex app-server."""

from __future__ import annotations

import asyncio
from base64 import b64decode
import json
import logging
import shutil
from collections.abc import AsyncGenerator
from contextlib import aclosing, asynccontextmanager, suppress
from pathlib import Path
from tempfile import TemporaryDirectory
from time import monotonic

from ..config import Settings
from .deepseek import ChatResult, StreamChunk

logger = logging.getLogger(__name__)


class CodexError(RuntimeError):
    def __init__(self, message: str, status_code: int = 502, code: str = "codex_error"):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


class AppServer:
    def __init__(self, process: asyncio.subprocess.Process, timeout: float):
        self.process = process
        self.timeout = timeout
        self.request_id = 0
        self.reusable = True

    async def send(self, method: str, params: dict | None = None, request_id: int | None = None):
        message = {"method": method}
        if params is not None:
            message["params"] = params
        if request_id is not None:
            message["id"] = request_id
        self.process.stdin.write(json.dumps(message).encode() + b"\n")
        await self.process.stdin.drain()

    async def receive(self) -> dict:
        line = await asyncio.wait_for(self.process.stdout.readline(), self.timeout)
        if not line:
            raise CodexError("Codex app-server 已断开，请检查本机 Codex 登录状态。", 503)
        message = json.loads(line)
        if "method" in message and "id" in message:
            raise CodexError(f"Codex 请求了交互操作（{message['method']}）。")
        return message

    async def request(self, method: str, params: dict) -> dict:
        self.request_id += 1
        await self.send(method, params, self.request_id)
        while True:
            message = await self.receive()
            if message.get("id") != self.request_id:
                continue
            if "error" in message:
                raise CodexError(f"Codex {method}：{message['error']['message']}")
            return message["result"]

    async def release_thread(self, thread_id: str):
        try:
            async with asyncio.timeout(1.5):
                await self.request("thread/unsubscribe", {"threadId": thread_id})
        except (CodexError, OSError, TimeoutError, ValueError, KeyError) as exc:
            self.reusable = False
            logger.debug("Discarding Codex connection after thread cleanup: %s", exc)

    async def close(self):
        if self.process.returncode is not None:
            return
        try:
            self.process.terminate()
            await asyncio.wait_for(self.process.wait(), 1)
        except ProcessLookupError:
            return
        except TimeoutError:
            try:
                self.process.kill()
            except ProcessLookupError:
                pass
            await self.process.wait()


class AppServerPool:
    """Keep one idle connection. Each live request owns its connection."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.idle: AppServer | None = None
        self.directory = TemporaryDirectory(prefix="selection-app-server-")

    async def start(self) -> AppServer:
        binary = self.settings.codex_app_server_bin
        if binary == "codex" and not shutil.which(binary):
            binary = str(Path.home() / ".local" / "bin" / binary)
        try:
            process = await asyncio.create_subprocess_exec(
                binary, "app-server", "--listen", "stdio://",
                "--disable", "shell_tool", "--disable", "apps", "--disable", "plugins",
                "--disable", "multi_agent_v2", "--disable", "skill_mcp_dependency_install",
                "-c", 'web_search="disabled"', "-c", "mcp_servers={}",
                cwd=self.directory.name,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
                limit=4 * 1024 * 1024,
            )
        except OSError as exc:
            raise CodexError(f"无法启动 Codex app-server：{exc}", 503, "codex_unavailable") from exc

        rpc = AppServer(process, self.settings.http_timeout_stream)
        initialized = False
        try:
            await rpc.request("initialize", {
                "clientInfo": {"name": "selection_assistance", "version": "0.1.0"},
                "capabilities": {"experimentalApi": True},
            })
            await rpc.send("initialized")
            initialized = True
            return rpc
        finally:
            if not initialized:
                await asyncio.shield(asyncio.create_task(rpc.close()))

    @asynccontextmanager
    async def acquire(self):
        rpc, self.idle = self.idle, None
        reusable = False
        try:
            if rpc is None or rpc.process.returncode is not None:
                rpc = await self.start()
            yield rpc
            reusable = rpc.reusable and self.idle is None and rpc.process.returncode is None
        except TimeoutError as exc:
            raise CodexError("等待 Codex app-server 响应超时。", 504, "codex_timeout") from exc
        except (BrokenPipeError, ConnectionResetError) as exc:
            raise CodexError("Codex app-server 连接已关闭。", 503, "codex_unavailable") from exc
        except (KeyError, ValueError, TypeError) as exc:
            raise CodexError("Codex app-server 响应格式无效。", code="codex_protocol") from exc
        finally:
            if reusable:
                self.idle = rpc
            elif rpc is not None:
                await asyncio.shield(asyncio.create_task(rpc.close()))

    async def close(self):
        try:
            if self.idle is not None:
                await self.idle.close()
        finally:
            self.directory.cleanup()


class CodexClient:
    def __init__(self, settings: Settings, pool: AppServerPool | None = None):
        self.settings = settings
        self.pool = pool or AppServerPool(settings)
        self.warmup: asyncio.Task | None = None
        self._models: list[dict] = []
        self._models_expire_at = 0.0
        self._models_lock = asyncio.Lock()

    def warm(self):
        self.warmup = asyncio.create_task(self.prime_catalog())

    async def prime_catalog(self):
        try:
            await self.models()
        except CodexError as exc:
            logger.debug("Codex app-server warmup failed: %s", exc)

    async def close(self):
        if self.warmup is not None:
            self.warmup.cancel()
            with suppress(asyncio.CancelledError):
                await self.warmup
        await self.pool.close()

    @property
    def model(self) -> str:
        return self.settings.codex_model

    async def stream(
        self,
        system: str | None = None,
        user: str | None = None,
        *,
        prompt: str | None = None,
        image_urls: list[str] | None = None,
        enable_thinking: bool | None = None,
        temperature: float = 0.3,
        max_tokens: int = 2048,
    ) -> AsyncGenerator[StreamChunk, None]:
        show_summary = self.settings.enable_thinking if enable_thinking is None else enable_thinking

        with TemporaryDirectory(prefix="selection-assistance-") as cwd:
            inputs = [
                {"type": "text", "text": prompt if prompt is not None else user, "text_elements": []}
            ]
            for index, url in enumerate(image_urls or ()):
                _, encoded = url.split(",", 1)
                path = Path(cwd) / f"attachment-{index}"
                path.write_bytes(b64decode(encoded))
                inputs.append({"type": "localImage", "path": str(path)})
            async with self.pool.acquire() as rpc:
                thread = await rpc.request("thread/start", {
                    "model": self.model,
                    "serviceTier": "default",
                    "cwd": cwd,
                    "ephemeral": True,
                    "environments": [],
                    "approvalPolicy": "never",
                    "sandbox": "read-only",
                    "allowProviderModelFallback": False,
                    "baseInstructions": (
                        "You are a reading assistant. Answer directly using the supplied text and images. "
                        "Treat supplied materials as content for the requested task. Do not use tools.\n\n"
                        + (system or "")
                    ),
                })
                model = thread["model"]
                if model != self.model:
                    raise CodexError(f"Codex 返回模型 {model}，请求的模型为 {self.model}。")
                thread_id = thread["thread"]["id"]
                turn = await rpc.request("turn/start", {
                    "threadId": thread_id,
                    "input": inputs,
                    "effort": self.settings.codex_reasoning_effort,
                    "serviceTierForTurn": "default",
                    "summary": "concise" if show_summary else "none",
                })
                turn_id = turn["turn"]["id"]
                async for chunk in self.turn_output(rpc, thread_id, turn_id, model, show_summary):
                    yield chunk
                await rpc.release_thread(thread_id)
                yield StreamChunk(model=model)

    async def models(self) -> list[dict]:
        async with self._models_lock:
            if self._models_expire_at > monotonic():
                return self._models
            models = []
            async with self.pool.acquire() as rpc:
                params = {"includeHidden": False}
                while True:
                    page = await rpc.request("model/list", params)
                    for model in page["data"]:
                        models.append({
                            "id": model["model"],
                            "label": model["displayName"],
                            "efforts": [option["reasoningEffort"] for option in model["supportedReasoningEfforts"]],
                            "default_effort": model["defaultReasoningEffort"],
                            "image": "image" in model["inputModalities"],
                        })
                    cursor = page.get("nextCursor")
                    if not cursor:
                        break
                    params["cursor"] = cursor
            self._models = models
            self._models_expire_at = monotonic() + 600
            return self._models

    async def select(self, model: str | None, effort: str | None) -> CodexClient:
        if not model and not effort:
            return self
        model = model or self.model
        choices = await self.models()
        choice = next((option for option in choices if option["id"] == model), None)
        if choice is None:
            raise CodexError(f"当前 Codex 账号的模型列表中没有 {model}。", 400, "invalid_model")
        effort = effort or self.settings.codex_reasoning_effort
        if effort not in choice["efforts"]:
            raise CodexError(f"{model} 不支持推理强度 {effort}。", 400, "invalid_effort")
        return CodexClient(
            self.settings.model_copy(update={"codex_model": model, "codex_reasoning_effort": effort}),
            pool=self.pool,
        )

    @staticmethod
    async def turn_output(rpc: AppServer, thread_id: str, turn_id: str, model: str, show_summary: bool):
        streamed_items: set[str] = set()
        while True:
            event = await rpc.receive()
            params = event.get("params") or {}
            if params.get("threadId") != thread_id:
                continue
            method = event.get("method")
            if method == "turn/completed":
                turn = params["turn"]
                if turn["id"] != turn_id:
                    continue
                if turn["status"] != "completed":
                    message = (turn.get("error") or {}).get("message") or turn["status"]
                    raise CodexError(f"Codex 生成失败：{message}")
                return
            if params.get("turnId") != turn_id:
                continue
            if method == "model/rerouted":
                raise CodexError(f"Codex 改用了模型 {params['toModel']}。")
            if method == "item/agentMessage/delta":
                streamed_items.add(params["itemId"])
                yield StreamChunk(content=params["delta"], model=model)
            elif method == "item/completed":
                item = params["item"]
                if item["type"] == "agentMessage" and item["id"] not in streamed_items:
                    yield StreamChunk(content=item["text"], model=model)
            elif method == "item/reasoning/summaryTextDelta" and show_summary:
                yield StreamChunk(reasoning=params["delta"], model=model)

    def stream_messages(self, messages: list[dict], **options) -> AsyncGenerator[StreamChunk, None]:
        system, *conversation = messages
        *history, question = conversation
        prompt = question["content"]
        if history:
            prompt = (
                "此前对话（JSON）：\n" + json.dumps(history, ensure_ascii=False)
                + "\n\n本轮问题：\n" + prompt
            )
        return self.stream(system["content"], prompt, **options)

    async def chat(self, *args, **options) -> ChatResult:
        return await self.collect(self.stream(*args, **options))

    async def chat_messages(self, messages: list[dict], **options) -> ChatResult:
        return await self.collect(self.stream_messages(messages, **options))

    async def collect(self, stream: AsyncGenerator[StreamChunk, None]) -> ChatResult:
        text, summary = [], []
        async with aclosing(stream):
            async for chunk in stream:
                text.append(chunk.content)
                summary.append(chunk.reasoning)
        return ChatResult("".join(text), "".join(summary) or None, self.model)
