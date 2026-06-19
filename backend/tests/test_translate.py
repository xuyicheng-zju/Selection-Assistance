"""翻译服务测试（mock DeepSeek）。覆盖纯文本翻译 + 流式 SSE 序列。"""

from __future__ import annotations

import json

import httpx
import pytest
import respx

from app.services import translate as translate_svc
from app.services.deepseek import DeepSeekClient


@respx.mock
@pytest.mark.asyncio
async def test_translate_text_word(settings, deepseek):
    # 词典 API 命中音标
    respx.get("https://api.dictionaryapi.dev/api/v2/entries/en/hello").mock(
        return_value=httpx.Response(200, json=[{"phonetic": "/həˈloʊ/", "phonetics": []}])
    )
    # DeepSeek 非流式
    respx.post("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "model": "deepseek-v4-pro",
                "choices": [
                    {
                        "message": {
                            "content": "你好",
                            "reasoning_content": "问候语",
                        }
                    }
                ],
            },
        )
    )
    out = await translate_svc.translate_text(
        text="hello", source_lang="auto", target_lang="zh",
        settings=settings, deepseek=deepseek,
    )
    assert out.translation == "你好"
    assert out.phonetics.ipa == "/həˈloʊ/"
    assert out.model == "deepseek-v4-pro"
    assert out.reasoning == "问候语"


@respx.mock
@pytest.mark.asyncio
async def test_stream_translate_text_event_sequence(settings, deepseek):
    respx.get("https://api.dictionaryapi.dev/api/v2/entries/en/hello").mock(
        return_value=httpx.Response(404, json={})  # 触发本地兜底
    )
    # 模拟 SSE 流：先 thinking 后 content，最后一帧 usage（choices 为空）
    sse_lines = [
        'data: {"model":"deepseek-v4-pro","choices":[{"delta":{"reasoning_content":"想一下"}}]}',
        'data: {"model":"deepseek-v4-pro","choices":[{"delta":{"content":"你好"}}]}',
        'data: {"model":"deepseek-v4-pro","choices":[{"delta":{"content":"世界"}}]}',
        'data: {"model":"deepseek-v4-pro","choices":[],"usage":{"total_tokens":5}}',
        "data: [DONE]",
    ]
    sse_body = "\n".join(sse_lines)
    respx.post(
        "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
    ).mock(return_value=httpx.Response(200, text=sse_body, headers={"content-type": "text/event-stream"}))

    phonetics, stream = await translate_svc.stream_translate_text(
        text="hello world", source_lang="auto", target_lang="zh",
        settings=settings, deepseek=deepseek,
    )
    contents = []
    reasonings = []
    async for chunk in stream:
        if chunk.content:
            contents.append(chunk.content)
        if chunk.reasoning:
            reasonings.append(chunk.reasoning)
    assert "".join(contents) == "你好世界"
    assert "".join(reasonings) == "想一下"


@respx.mock
@pytest.mark.asyncio
async def test_translate_deepseek_error_propagates(settings, deepseek):
    respx.get("https://api.dictionaryapi.dev/api/v2/entries/en/hello").mock(
        return_value=httpx.Response(404)
    )
    respx.post(
        "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
    ).mock(return_value=httpx.Response(401, json={"error": "bad key"}))
    from app.services.deepseek import DeepSeekError
    with pytest.raises(DeepSeekError) as exc:
        await translate_svc.translate_text(
            text="hello", source_lang="auto", target_lang="zh",
            settings=settings, deepseek=deepseek,
        )
    # 401 映射为 503
    assert exc.value.status_code == 503


def test_deepseek_payload_includes_enable_thinking(deepseek):
    """确认 enable_thinking 被透传到请求体。"""
    # 默认用全局配置（settings.enable_thinking，默认 false）
    p = deepseek._payload("sys", "usr", temperature=0.1, max_tokens=10, stream=True)
    assert p["model"] == "deepseek-v4-pro"
    assert p["enable_thinking"] is False
    assert p["stream"] is True
    assert p["messages"][0]["content"] == "sys"
    # 显式覆盖
    p2 = deepseek._payload(
        "sys", "usr", temperature=0.1, max_tokens=10, stream=True, enable_thinking=True
    )
    assert p2["enable_thinking"] is True
