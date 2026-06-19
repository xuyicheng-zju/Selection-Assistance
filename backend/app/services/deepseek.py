"""DeepSeek 客户端 —— 经阿里云百炼（DashScope）OpenAI 兼容端点调用。

与 Qwen-VL 共用同一个 DASHSCOPE_API_KEY 与 base_url。
deepseek-v4-pro 支持 enable_thinking：流式输出 reasoning_content（思考）+ content（回复）。
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import AsyncIterator, Optional

import httpx

from ..config import Settings


class DeepSeekError(RuntimeError):
    def __init__(self, message: str, status_code: int = 502, code: str = "deepseek_error"):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


@dataclass(slots=True)
class ChatResult:
    content: str
    reasoning: Optional[str]
    model: str


@dataclass(slots=True)
class StreamChunk:
    """流式产出的一帧。content / reasoning 至多一个非空。"""

    content: str = ""
    reasoning: str = ""
    model: str = ""


class DeepSeekClient:
    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self._settings = settings
        self._client = client

    @property
    def model(self) -> str:
        return self._settings.deepseek_model

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._settings.dashscope_api_key}",
            "Content-Type": "application/json",
        }

    def _payload(
        self,
        system: str,
        user: str,
        *,
        temperature: float,
        max_tokens: int,
        stream: bool,
        enable_thinking: bool | None = None,
    ) -> dict:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": stream,
        }
        # 百炼的思考模式开关（extra_body 透传）。None 时用全局默认。
        payload["enable_thinking"] = (
            self._settings.enable_thinking if enable_thinking is None else enable_thinking
        )
        return payload

    def _messages_payload(
        self,
        messages: list[dict],
        *,
        temperature: float,
        max_tokens: int,
        stream: bool,
        enable_thinking: bool | None = None,
    ) -> dict:
        """多轮对话：直接接收完整 messages 数组。"""
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": stream,
            "enable_thinking": (
                self._settings.enable_thinking if enable_thinking is None else enable_thinking
            ),
        }
        return payload

    async def chat(
        self,
        system: str,
        user: str,
        *,
        temperature: float = 0.3,
        max_tokens: int = 2048,
        enable_thinking: bool | None = None,
    ) -> ChatResult:
        """非流式对话。"""
        payload = self._payload(
            system,
            user,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=False,
            enable_thinking=enable_thinking,
        )
        url = f"{self._settings.dashscope_base_url}/chat/completions"
        try:
            resp = await self._client.post(url, json=payload, headers=self._headers())
        except httpx.HTTPError as exc:
            raise DeepSeekError(f"DeepSeek 网络错误: {exc}", code="network") from exc
        if resp.status_code >= 400:
            raise DeepSeekError(
                f"DeepSeek 返回 {resp.status_code}: {resp.text[:300]}",
                status_code=_map_status(resp.status_code),
            )
        data = resp.json()
        choice = (data.get("choices") or [{}])[0].get("message", {})
        return ChatResult(
            content=choice.get("content") or "",
            reasoning=choice.get("reasoning_content"),
            model=data.get("model", self.model),
        )

    async def stream(
        self,
        system: str,
        user: str,
        *,
        temperature: float = 0.3,
        max_tokens: int = 2048,
        enable_thinking: bool | None = None,
    ) -> AsyncIterator[StreamChunk]:
        """流式对话，逐 chunk yield StreamChunk。

        enable_thinking 开启时，思考部分以 reasoning 字段输出（前端可隐藏展示）。
        """
        payload = self._payload(
            system,
            user,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
            enable_thinking=enable_thinking,
        )
        url = f"{self._settings.dashscope_base_url}/chat/completions"
        try:
            async with self._client.stream(
                "POST", url, json=payload, headers=self._headers()
            ) as resp:
                if resp.status_code >= 400:
                    body = await resp.aread()
                    raise DeepSeekError(
                        f"DeepSeek 返回 {resp.status_code}: {body[:300]!r}",
                        status_code=_map_status(resp.status_code),
                    )
                async for line in resp.aiter_lines():
                    chunk = _parse_sse_line(line)
                    if chunk is not None:
                        yield chunk
        except DeepSeekError:
            raise
        except httpx.HTTPError as exc:
            raise DeepSeekError(f"DeepSeek 流式网络错误: {exc}", code="network") from exc

    # ------------------------------------------------------------------
    # 多轮对话（messages 数组）—— 供 /api/chat 追问使用
    # ------------------------------------------------------------------
    async def chat_messages(
        self,
        messages: list[dict],
        *,
        temperature: float = 0.3,
        max_tokens: int = 2048,
        enable_thinking: bool | None = None,
    ) -> ChatResult:
        """非流式多轮对话。"""
        payload = self._messages_payload(
            messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=False,
            enable_thinking=enable_thinking,
        )
        url = f"{self._settings.dashscope_base_url}/chat/completions"
        try:
            resp = await self._client.post(url, json=payload, headers=self._headers())
        except httpx.HTTPError as exc:
            raise DeepSeekError(f"DeepSeek 网络错误: {exc}", code="network") from exc
        if resp.status_code >= 400:
            raise DeepSeekError(
                f"DeepSeek 返回 {resp.status_code}: {resp.text[:300]}",
                status_code=_map_status(resp.status_code),
            )
        data = resp.json()
        choice = (data.get("choices") or [{}])[0].get("message", {})
        return ChatResult(
            content=choice.get("content") or "",
            reasoning=choice.get("reasoning_content"),
            model=data.get("model", self.model),
        )

    async def stream_messages(
        self,
        messages: list[dict],
        *,
        temperature: float = 0.3,
        max_tokens: int = 2048,
        enable_thinking: bool | None = None,
    ) -> AsyncIterator[StreamChunk]:
        """流式多轮对话。"""
        payload = self._messages_payload(
            messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
            enable_thinking=enable_thinking,
        )
        url = f"{self._settings.dashscope_base_url}/chat/completions"
        try:
            async with self._client.stream(
                "POST", url, json=payload, headers=self._headers()
            ) as resp:
                if resp.status_code >= 400:
                    body = await resp.aread()
                    raise DeepSeekError(
                        f"DeepSeek 返回 {resp.status_code}: {body[:300]!r}",
                        status_code=_map_status(resp.status_code),
                    )
                async for line in resp.aiter_lines():
                    chunk = _parse_sse_line(line)
                    if chunk is not None:
                        yield chunk
        except DeepSeekError:
            raise
        except httpx.HTTPError as exc:
            raise DeepSeekError(f"DeepSeek 流式网络错误: {exc}", code="network") from exc


def _map_status(status: int) -> int:
    if status == 401:
        return 503  # 上游鉴权失败，对调用方表现为服务不可用
    if status == 429:
        return 429
    return 502


def _parse_sse_line(line: str) -> Optional[StreamChunk]:
    """解析一行 SSE 数据（`data: {...}`）。"""
    line = line.strip()
    if not line or not line.startswith("data:"):
        return None
    data = line[5:].strip()
    if data == "[DONE]":
        return None
    try:
        obj = json.loads(data)
    except json.JSONDecodeError:
        return None
    # usage-only 帧（choices 为空）跳过
    if not obj.get("choices"):
        return None
    choice = obj["choices"][0]
    delta = choice.get("delta", {}) or {}
    content = delta.get("content") or ""
    reasoning = delta.get("reasoning_content") or ""
    if not content and not reasoning:
        return None
    return StreamChunk(
        content=content, reasoning=reasoning, model=obj.get("model", "")
    )
