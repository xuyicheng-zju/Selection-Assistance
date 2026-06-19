"""视觉服务测试（mock Qwen-VL）：OCR 提取 + 看图解释 + 图文翻译。"""

from __future__ import annotations

import httpx
import pytest
import respx

from app.services import vision as vision_svc
from app.services import translate as translate_svc
from app.services import explain as explain_svc


VURL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"


@respx.mock
@pytest.mark.asyncio
async def test_ocr_extracts_lines(qwen_vl):
    respx.post(VURL).mock(
        return_value=httpx.Response(
            200,
            json={
                "model": "qwen-vl-max",
                "choices": [{"message": {"content": "第一行\n第二行\n第三行"}}],
            },
        )
    )
    result = await vision_svc.ocr(qwen_vl, ["data:image/png;base64,AAAA"])
    assert result.full_text == "第一行\n第二行\n第三行"
    assert result.texts == ["第一行", "第二行", "第三行"]
    assert result.model == "qwen-vl-max"


@respx.mock
@pytest.mark.asyncio
async def test_vision_translate_image(qwen_vl):
    respx.post(VURL).mock(
        return_value=httpx.Response(
            200,
            json={
                "model": "qwen-vl-max",
                "choices": [{"message": {"content": "识别到的译文"}}],
            },
        )
    )
    out = await translate_svc.translate_image(
        text="翻译图中文字", target_lang="zh",
        image_urls=["data:image/png;base64,AAAA"], qwen_vl=qwen_vl,
    )
    assert out.translation == "识别到的译文"
    assert out.model == "qwen-vl-max"
    # 图像分支无音标
    assert out.phonetics.ipa is None


@respx.mock
@pytest.mark.asyncio
async def test_vision_explain_image(qwen_vl):
    respx.post(VURL).mock(
        return_value=httpx.Response(
            200,
            json={
                "model": "qwen-vl-max",
                "choices": [{"message": {"content": "## 解释\n这是一张截图..."}}],
            },
        )
    )
    out = await explain_svc.explain_image(
        text="这张图怎么用", context=None,
        image_urls=["data:image/png;base64,AAAA"], qwen_vl=qwen_vl,
    )
    assert "截图" in out.explanation
    assert out.model == "qwen-vl-max"


@respx.mock
@pytest.mark.asyncio
async def test_vision_stream_chunks(qwen_vl):
    sse_lines = [
        'data: {"model":"qwen-vl-max","choices":[{"delta":{"content":"这是"}}]}',
        'data: {"model":"qwen-vl-max","choices":[{"delta":{"content":"峡湾"}}]}',
        "data: [DONE]",
    ]
    respx.post(VURL).mock(
        return_value=httpx.Response(
            200, text="\n".join(sse_lines), headers={"content-type": "text/event-stream"}
        )
    )
    parts = []
    async for chunk in vision_svc.stream_explain_with_image(
        qwen_vl, ["data:image/png;base64,AAAA"], "描述", None
    ):
        parts.append(chunk.content)
    assert "".join(parts) == "这是峡湾"


@respx.mock
@pytest.mark.asyncio
async def test_vision_qwen_error_propagates(qwen_vl):
    respx.post(VURL).mock(return_value=httpx.Response(429, json={"error": "rate limit"}))
    from app.services.qwen_vl import QwenVLError
    with pytest.raises(QwenVLError) as exc:
        await vision_svc.ocr(qwen_vl, ["data:image/png;base64,AAAA"])
    assert exc.value.status_code == 429
