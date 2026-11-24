"""依赖注入：HTTP 客户端与模型客户端单例，随 FastAPI lifespan 创建/关闭。

FastAPI 端点通过 `Depends(get_deepseek)` / `Depends(get_qwen_vl)` 拿到单例。
"""

from __future__ import annotations

from typing import Optional

import httpx
from fastapi import HTTPException, Request

from .config import ModelBackend, Settings, get_settings
from .services.codex import CodexClient, CodexError
from .services.deepseek import DeepSeekClient
from .services.qwen_vl import QwenVLClient


# 进程级单例（lifespan 写入, 端点读取）
_state: dict[str, object] = {}


def init_clients(settings: Settings) -> None:
    """在 lifespan startup 时调用，创建共享 httpx 客户端。"""
    if _state:
        return
    if settings.local_token or settings.model_backend == "codex":
        codex = CodexClient(settings)
        _state["codex"] = codex
        if settings.model_backend == "codex":
            codex.warm()
    if not settings.local_token and settings.model_backend == "codex":
        return
    timeout = httpx.Timeout(
        connect=settings.http_timeout_connect,
        # 读超时对流式调用意义不大（流式单独用 stream()），这里给一个上限
        read=settings.http_timeout_stream,
        write=settings.http_timeout_connect,
        pool=settings.http_timeout_connect,
    )
    # trust_env=False: 不继承系统的 HTTP_PROXY/SOCKS 代理，避免在无 socksio
    # 的环境里启动失败；生产环境如需走代理，请显式配置 transport。
    http = httpx.AsyncClient(timeout=timeout, trust_env=False)
    _state["http"] = http
    _state["deepseek"] = DeepSeekClient(settings, http)
    _state["qwen_vl"] = QwenVLClient(settings, http)


async def close_clients() -> None:
    """在 lifespan shutdown 时调用。"""
    codex = get_codex()
    if codex is not None:
        await codex.close()
    http = _state.get("http")
    if isinstance(http, httpx.AsyncClient):
        await http.aclose()
    _state.clear()


def get_http() -> httpx.AsyncClient:
    http = _state.get("http")
    if http is None:
        raise RuntimeError("HTTP 客户端未初始化，请检查 lifespan 是否启动")
    return http  # type: ignore[return-value]


def get_codex() -> CodexClient | None:
    return _state.get("codex")


def request_model_backend(request: Request) -> ModelBackend:
    return getattr(request.state, "model_backend", get_settings().model_backend)


async def _selected_codex(request: Request) -> CodexClient:
    selected = getattr(request.state, "codex", None)
    if selected is None:
        codex = get_codex()
        try:
            selected = await codex.select(
                request.headers.get("x-codex-model"), request.headers.get("x-codex-effort"),
            )
        except CodexError as exc:
            raise HTTPException(exc.status_code, {"code": exc.code, "message": str(exc)}) from exc
        request.state.codex = selected
    return selected


async def get_deepseek(request: Request) -> DeepSeekClient | CodexClient:
    if request_model_backend(request) == "codex":
        return await _selected_codex(request)
    _require_dashscope_key()
    client = _state.get("deepseek")
    if client is None:
        raise RuntimeError("DeepSeek 客户端未初始化")
    return client


async def get_qwen_vl(request: Request) -> QwenVLClient | CodexClient:
    if request_model_backend(request) == "codex":
        return await _selected_codex(request)
    _require_dashscope_key()
    client = _state.get("qwen_vl")
    if client is None:
        raise RuntimeError("Qwen-VL 客户端未初始化")
    return client


async def get_optional_qwen_vl(request: Request) -> QwenVLClient | CodexClient | None:
    if request_model_backend(request) == "codex":
        return await _selected_codex(request)
    return _state.get("qwen_vl")


def _require_dashscope_key() -> None:
    if not get_settings().dashscope_api_key:
        raise HTTPException(503, {"code": "missing_api_key", "message": "请在后端 .env 配置百炼 DASHSCOPE_API_KEY。"})


def settings() -> Settings:
    return get_settings()
