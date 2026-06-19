"""依赖注入：HTTP 客户端与模型客户端单例，随 FastAPI lifespan 创建/关闭。

FastAPI 端点通过 `Depends(get_deepseek)` / `Depends(get_qwen_vl)` 拿到单例。
"""

from __future__ import annotations

from typing import Optional

import httpx

from .config import Settings, get_settings
from .services.deepseek import DeepSeekClient
from .services.qwen_vl import QwenVLClient


# 进程级单例（lifespan 写入, 端点读取）
_state: dict[str, object] = {}


def init_clients(settings: Settings) -> None:
    """在 lifespan startup 时调用，创建共享 httpx 客户端。"""
    if "http" in _state:
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
    http = _state.get("http")
    if isinstance(http, httpx.AsyncClient):
        await http.aclose()
    _state.clear()


def get_http() -> httpx.AsyncClient:
    http = _state.get("http")
    if http is None:
        raise RuntimeError("HTTP 客户端未初始化，请检查 lifespan 是否启动")
    return http  # type: ignore[return-value]


def get_deepseek() -> DeepSeekClient:
    client = _state.get("deepseek")
    if client is None:
        raise RuntimeError("DeepSeek 客户端未初始化")
    return client  # type: ignore[return-value]


def get_qwen_vl() -> QwenVLClient:
    client = _state.get("qwen_vl")
    if client is None:
        raise RuntimeError("Qwen-VL 客户端未初始化")
    return client  # type: ignore[return-value]


def get_optional_qwen_vl() -> Optional[QwenVLClient]:
    return _state.get("qwen_vl")  # type: ignore[return-value]


def settings() -> Settings:
    return get_settings()
