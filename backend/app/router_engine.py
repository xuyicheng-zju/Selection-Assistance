"""多模态路由：纯文本 → DeepSeek，含图 → Qwen-VL。

路由纯靠「有无 images」判断，简单可靠。同时提供图像 → data URL 的工具函数。
"""

from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Optional

from .services.deepseek import DeepSeekClient
from .services.qwen_vl import QwenVLClient


@dataclass(slots=True)
class RouteDecision:
    backend: str  # "deepseek" | "qwen_vl"
    reason: str


def route(text: Optional[str], images: list[str]) -> RouteDecision:
    """根据是否有图像决定走哪个后端。

    images: data URL（data:image/...;base64,...）或 http(s) URL 列表。
    """
    if images:
        return RouteDecision(backend="qwen_vl", reason="含图像，路由到多模态")
    if text and text.strip():
        return RouteDecision(backend="deepseek", reason="纯文本，路由到 DeepSeek")
    return RouteDecision(backend="deepseek", reason="无输入，默认 DeepSeek")


def images_to_data_urls(raw_images: list[bytes], mime: str = "image/png") -> list[str]:
    """把上传的图像字节转成 data URL。"""
    out = []
    for raw in raw_images:
        b64 = base64.b64encode(raw).decode("ascii")
        out.append(f"data:{mime};base64,{b64}")
    return out


def select_clients(
    decision: RouteDecision,
    deepseek: DeepSeekClient,
    qwen_vl: Optional[QwenVLClient],
) -> DeepSeekClient | QwenVLClient:
    if decision.backend == "qwen_vl":
        if qwen_vl is None:
            raise RuntimeError("多模态路由需要 Qwen-VL，但客户端未配置（缺少 DASHSCOPE_API_KEY）")
        return qwen_vl
    return deepseek
