"""翻译编排：取音标 → 路由（纯文本 DeepSeek / 含图 Qwen-VL）→ 产出。

非流式与流式两个入口。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import AsyncIterator, Optional

from ..prompts import TRANSLATE_SYSTEM, translate_user_prompt
from ..schemas import Phonetics
from . import vision as vision_svc
from .deepseek import DeepSeekClient, DeepSeekError, StreamChunk
from .phonetics import get_phonetics, classify
from .qwen_vl import QwenVLClient, VStreamChunk


@dataclass(slots=True)
class TranslateOutput:
    text: str
    phonetics: Phonetics
    translation: str
    detected_lang: Optional[str]
    model: str
    reasoning: Optional[str]


async def translate_text(
    *,
    text: str,
    source_lang: str,
    target_lang: str,
    settings,
    deepseek: DeepSeekClient,
    enable_thinking: Optional[bool] = None,
) -> TranslateOutput:
    """纯文本翻译（DeepSeek）。"""
    phonetics = await get_phonetics(text, settings=settings, deepseek=deepseek)
    result = await deepseek.chat(
        system=TRANSLATE_SYSTEM,
        user=translate_user_prompt(text, source_lang, target_lang),
        temperature=0.2,
        max_tokens=2048,
        enable_thinking=enable_thinking,
    )
    detected = "zh" if classify(text) == "chinese" else None
    return TranslateOutput(
        text=text,
        phonetics=phonetics,
        translation=result.content.strip(),
        detected_lang=detected,
        model=result.model,
        reasoning=result.reasoning,
    )


async def translate_image(
    *,
    text: Optional[str],
    target_lang: str,
    image_urls: list[str],
    qwen_vl: QwenVLClient,
) -> TranslateOutput:
    """含图翻译（Qwen-VL）。"""
    result = await vision_svc.translate_with_image(qwen_vl, image_urls, text, target_lang)
    return TranslateOutput(
        text=text or "",
        phonetics=Phonetics(),
        translation=result.content.strip(),
        detected_lang=None,
        model=result.model,
        reasoning=None,
    )


async def stream_translate_text(
    *,
    text: str,
    source_lang: str,
    target_lang: str,
    settings,
    deepseek: DeepSeekClient,
    enable_thinking: Optional[bool] = None,
) -> tuple[Phonetics, AsyncIterator[StreamChunk]]:
    """纯文本流式翻译。先返回音标，再返回流式 chunk 迭代器。"""
    phonetics = await get_phonetics(text, settings=settings, deepseek=deepseek)
    stream = deepseek.stream(
        system=TRANSLATE_SYSTEM,
        user=translate_user_prompt(text, source_lang, target_lang),
        temperature=0.2,
        max_tokens=2048,
        enable_thinking=enable_thinking,
    )
    return phonetics, stream


def stream_translate_image(
    *,
    text: Optional[str],
    target_lang: str,
    image_urls: list[str],
    qwen_vl: QwenVLClient,
) -> AsyncIterator[VStreamChunk]:
    return vision_svc.stream_translate_with_image(qwen_vl, image_urls, text, target_lang)


__all__ = [
    "TranslateOutput",
    "translate_text",
    "translate_image",
    "stream_translate_text",
    "stream_translate_image",
    "DeepSeekError",
]
