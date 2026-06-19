"""多模态路由测试：纯文本 → DeepSeek，含图 → Qwen-VL。"""

from __future__ import annotations

import pytest

from app.router_engine import route, images_to_data_urls, select_clients
from app.services.deepseek import DeepSeekError
from app.services.qwen_vl import QwenVLClient


def test_route_text_only():
    decision = route("hello", [])
    assert decision.backend == "deepseek"


def test_route_image_only():
    decision = route(None, ["data:image/png;base64,xxxx"])
    assert decision.backend == "qwen_vl"


def test_route_text_and_image_prefers_vision():
    # 含图优先多模态
    decision = route("翻译这个", ["data:image/png;base64,xxxx"])
    assert decision.backend == "qwen_vl"


def test_route_empty_defaults_deepseek():
    decision = route(None, [])
    assert decision.backend == "deepseek"


def test_images_to_data_urls():
    urls = images_to_data_urls([b"\x89PNG\r\n"], mime="image/png")
    assert len(urls) == 1
    assert urls[0].startswith("data:image/png;base64,")


def test_images_to_data_urls_multiple_mime():
    urls = images_to_data_urls([b"abc", b"def"], mime="image/jpeg")
    assert len(urls) == 2
    assert all(u.startswith("data:image/jpeg;base64,") for u in urls)


def test_select_clients_qwen_vl_when_configured(deepseek, qwen_vl):
    decision = route(None, ["data:image/png;base64,x"])
    selected = select_clients(decision, deepseek, qwen_vl)
    assert isinstance(selected, QwenVLClient)


def test_select_clients_raises_when_qwen_missing(deepseek):
    decision = route(None, ["data:image/png;base64,x"])
    with pytest.raises(RuntimeError):
        select_clients(decision, deepseek, None)


def test_select_clients_deepseek_for_text(deepseek, qwen_vl):
    decision = route("hello", [])
    selected = select_clients(decision, deepseek, qwen_vl)
    # 纯文本走 DeepSeek
    assert selected is deepseek
