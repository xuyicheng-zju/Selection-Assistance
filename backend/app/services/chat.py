"""多轮对话编排：基于用户选中文本 + 历史 + 本轮追问，走 DeepSeek（v4-pro，支持思考模式）。

无状态：前端每次把完整 history 发上来。提供非流式 + 流式两个入口。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import AsyncIterator, Optional

from ..prompts import build_chat_messages
from .deepseek import DeepSeekClient, DeepSeekError, StreamChunk


@dataclass(slots=True)
class ChatOutput:
    answer: str
    model: str
    reasoning: str | None


async def chat(
    *,
    selected_text: str,
    initial_action: str,
    history: list[dict],
    question: str,
    deepseek: DeepSeekClient,
    enable_thinking: Optional[bool] = None,
) -> ChatOutput:
    messages = build_chat_messages(selected_text, initial_action, history, question)
    result = await deepseek.chat_messages(
        messages, temperature=0.4, max_tokens=2048, enable_thinking=enable_thinking
    )
    return ChatOutput(
        answer=result.content.strip(),
        model=result.model,
        reasoning=result.reasoning,
    )


def stream_chat(
    *,
    selected_text: str,
    initial_action: str,
    history: list[dict],
    question: str,
    deepseek: DeepSeekClient,
    enable_thinking: Optional[bool] = None,
) -> AsyncIterator[StreamChunk]:
    messages = build_chat_messages(selected_text, initial_action, history, question)
    return deepseek.stream_messages(
        messages, temperature=0.4, max_tokens=2048, enable_thinking=enable_thinking
    )


__all__ = ["ChatOutput", "chat", "stream_chat", "DeepSeekError"]
