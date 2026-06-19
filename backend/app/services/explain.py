"""解释编排：取音标 → 路由（纯文本 DeepSeek / 含图 Qwen-VL）→ 产出。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import AsyncIterator, Optional

from ..prompts import EXPLAIN_SYSTEM, explain_user_prompt
from ..schemas import Phonetics
from . import vision as vision_svc
from .deepseek import DeepSeekClient, DeepSeekError, StreamChunk
from .phonetics import get_phonetics
from .qwen_vl import QwenVLClient, VStreamChunk


@dataclass(slots=True)
class ExplainOutput:
    text: str
    phonetics: Phonetics
    explanation: str
    model: str
    reasoning: Optional[str]


async def explain_text(
    *,
    text: str,
    context: Optional[str],
    style: str,
    settings,
    deepseek: DeepSeekClient,
    enable_thinking: Optional[bool] = None,
) -> ExplainOutput:
    phonetics = await get_phonetics(text, settings=settings, deepseek=deepseek)
    result = await deepseek.chat(
        system=EXPLAIN_SYSTEM,
        user=explain_user_prompt(text, context, style),
        temperature=0.3,
        max_tokens=2048,
        enable_thinking=enable_thinking,
    )
    return ExplainOutput(
        text=text,
        phonetics=phonetics,
        explanation=result.content.strip(),
        model=result.model,
        reasoning=result.reasoning,
    )


async def explain_image(
    *,
    text: Optional[str],
    context: Optional[str],
    image_urls: list[str],
    qwen_vl: QwenVLClient,
) -> ExplainOutput:
    result = await vision_svc.explain_with_image(qwen_vl, image_urls, text, context)
    return ExplainOutput(
        text=text or "",
        phonetics=Phonetics(),
        explanation=result.content.strip(),
        model=result.model,
        reasoning=None,
    )


async def stream_explain_text(
    *,
    text: str,
    context: Optional[str],
    style: str,
    settings,
    deepseek: DeepSeekClient,
    enable_thinking: Optional[bool] = None,
) -> tuple[Phonetics, AsyncIterator[StreamChunk]]:
    phonetics = await get_phonetics(text, settings=settings, deepseek=deepseek)
    stream = deepseek.stream(
        system=EXPLAIN_SYSTEM,
        user=explain_user_prompt(text, context, style),
        temperature=0.3,
        max_tokens=2048,
        enable_thinking=enable_thinking,
    )
    return phonetics, stream


def stream_explain_image(
    *,
    text: Optional[str],
    context: Optional[str],
    image_urls: list[str],
    qwen_vl: QwenVLClient,
) -> AsyncIterator[VStreamChunk]:
    return vision_svc.stream_explain_with_image(qwen_vl, image_urls, text, context)


__all__ = [
    "ExplainOutput",
    "explain_text",
    "explain_image",
    "stream_explain_text",
    "stream_explain_image",
    "DeepSeekError",
]
