"""多轮对话服务测试（mock DeepSeek）。"""

from __future__ import annotations

import httpx
import pytest
import respx

from app.services import chat as chat_svc
from app.services.chat import ChatOutput


@respx.mock
@pytest.mark.asyncio
async def test_chat_returns_answer_and_model(settings, deepseek):
    respx.post(
        "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
    ).mock(
        return_value=httpx.Response(
            200,
            json={
                "model": "deepseek-v4-pro",
                "choices": [
                    {"message": {"content": "举例：a serendipity.", "reasoning_content": "想了一下"}}
                ],
            },
        )
    )
    out = await chat_svc.chat(
        selected_text="serendipity",
        initial_action="translate",
        history=[{"role": "assistant", "content": "意外发现"}],
        question="举例",
        deepseek=deepseek,
    )
    assert isinstance(out, ChatOutput)
    assert "举例" in out.answer
    assert out.model == "deepseek-v4-pro"
    assert out.reasoning == "想了一下"


@respx.mock
@pytest.mark.asyncio
async def test_chat_messages_include_history_and_question(settings, deepseek):
    """确认 messages 数组含 system + 历史 + 本轮问题。"""
    captured: dict = {}
    route = respx.post(
        "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
    )
    route.mock(
        side_effect=lambda request: (
            captured.update({"body": httpx.Response(200).json}) or None
        )
    )
    # 用更直接的方式：拦截请求体
    bodies = []

    def _side(request):
        import json as _json

        bodies.append(_json.loads(request.content))
        return httpx.Response(
            200,
            json={"model": "deepseek-v4-pro", "choices": [{"message": {"content": "ok"}}]},
        )

    route.mock(side_effect=_side)

    await chat_svc.chat(
        selected_text="hello",
        initial_action="explain",
        history=[
            {"role": "user", "content": "q1"},
            {"role": "assistant", "content": "a1"},
        ],
        question="q2",
        deepseek=deepseek,
    )
    assert len(bodies) == 1
    msgs = bodies[0]["messages"]
    # system + 2 历史 + 1 本轮 = 4
    assert len(msgs) == 4
    assert msgs[0]["role"] == "system"
    assert "hello" in msgs[0]["content"]
    assert msgs[1] == {"role": "user", "content": "q1"}
    assert msgs[2] == {"role": "assistant", "content": "a1"}
    assert msgs[3] == {"role": "user", "content": "q2"}
    # enable_thinking 默认用全局配置（settings.enable_thinking，默认 false）
    assert bodies[0]["enable_thinking"] is False


@respx.mock
@pytest.mark.asyncio
async def test_chat_stream_yields_chunks(settings, deepseek):
    sse_lines = [
        'data: {"model":"deepseek-v4-pro","choices":[{"delta":{"reasoning_content":"思考"}}]}',
        'data: {"model":"deepseek-v4-pro","choices":[{"delta":{"content":"答案"}}]}',
        "data: [DONE]",
    ]
    respx.post(
        "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
    ).mock(
        return_value=httpx.Response(
            200, text="\n".join(sse_lines), headers={"content-type": "text/event-stream"}
        )
    )
    contents, reasonings = [], []
    async for chunk in chat_svc.stream_chat(
        selected_text="x", initial_action="explain", history=[], question="q", deepseek=deepseek
    ):
        if chunk.content:
            contents.append(chunk.content)
        if chunk.reasoning:
            reasonings.append(chunk.reasoning)
    assert "".join(contents) == "答案"
    assert "".join(reasonings) == "思考"


@respx.mock
@pytest.mark.asyncio
async def test_chat_error_propagates(settings, deepseek):
    respx.post(
        "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
    ).mock(return_value=httpx.Response(429, json={"error": "rate limit"}))
    from app.services.deepseek import DeepSeekError
    with pytest.raises(DeepSeekError) as exc:
        await chat_svc.chat(
            selected_text="x", initial_action="explain", history=[], question="q",
            deepseek=deepseek,
        )
    assert exc.value.status_code == 429
