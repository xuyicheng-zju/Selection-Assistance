"""视觉编排：OCR 提取 / 看图解释 / 图文问答（统一走 Qwen-VL）。

提供非流式与流式两个入口。translate/explain 的含图分支复用这里的能力。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import AsyncIterator, Optional

from ..prompts import (
    OCR_SYSTEM,
    OCR_USER,
    VISION_EXPLAIN_SYSTEM,
    VISION_TRANSLATE_SYSTEM,
    vision_explain_user,
    vision_translate_user,
)
from .qwen_vl import QwenVLClient, QwenVLError, VChatResult, VStreamChunk


@dataclass(slots=True)
class OcrResult:
    texts: list[str]
    full_text: str
    model: str


async def ocr(qwen_vl: QwenVLClient, image_urls: list[str]) -> OcrResult:
    """纯 OCR 提取文字。"""
    result = await qwen_vl.chat(
        prompt=OCR_USER, image_urls=image_urls, system=OCR_SYSTEM, temperature=0.0
    )
    full = (result.content or "").strip()
    texts = [ln for ln in full.splitlines() if ln.strip()]
    return OcrResult(texts=texts, full_text=full, model=result.model)


async def translate_with_image(
    qwen_vl: QwenVLClient,
    image_urls: list[str],
    text: Optional[str],
    target_lang: str,
) -> VChatResult:
    return await qwen_vl.chat(
        prompt=vision_translate_user(text, target_lang),
        image_urls=image_urls,
        system=VISION_TRANSLATE_SYSTEM,
        temperature=0.3,
    )


async def explain_with_image(
    qwen_vl: QwenVLClient,
    image_urls: list[str],
    text: Optional[str],
    context: Optional[str],
) -> VChatResult:
    return await qwen_vl.chat(
        prompt=vision_explain_user(text, context),
        image_urls=image_urls,
        system=VISION_EXPLAIN_SYSTEM,
        temperature=0.3,
    )


async def stream_explain_with_image(
    qwen_vl: QwenVLClient,
    image_urls: list[str],
    text: Optional[str],
    context: Optional[str],
) -> AsyncIterator[VStreamChunk]:
    async for chunk in qwen_vl.stream(
        prompt=vision_explain_user(text, context),
        image_urls=image_urls,
        system=VISION_EXPLAIN_SYSTEM,
        temperature=0.3,
    ):
        yield chunk


async def stream_translate_with_image(
    qwen_vl: QwenVLClient,
    image_urls: list[str],
    text: Optional[str],
    target_lang: str,
) -> AsyncIterator[VStreamChunk]:
    async for chunk in qwen_vl.stream(
        prompt=vision_translate_user(text, target_lang),
        image_urls=image_urls,
        system=VISION_TRANSLATE_SYSTEM,
        temperature=0.3,
    ):
        yield chunk


__all__ = [
    "OcrResult",
    "ocr",
    "translate_with_image",
    "explain_with_image",
    "stream_explain_with_image",
    "stream_translate_with_image",
    "QwenVLError",
]
