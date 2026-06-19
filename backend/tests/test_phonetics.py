"""音标与文本分类测试。"""

from __future__ import annotations

import pytest
import respx
import httpx

from app.services import phonetics
from app.services.phonetics import classify, needs_phonetics, get_phonetics


# ---------------------------------------------------------------------------
# classify / needs_phonetics
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "text,expected",
    [
        ("hello", "word"),
        ("serendipity", "word"),
        ("good morning", "phrase"),
        ("the quick brown fox jumps over the lazy dog", "sentence"),
        ("你好", "chinese"),
        ("你好世界", "chinese"),
        ("def foo():\n    pass", "code"),
        ("function add(a,b){return a+b}", "code"),
        ("12345", "other"),
        ("", "other"),
    ],
)
def test_classify(text, expected):
    assert classify(text) == expected


@pytest.mark.parametrize(
    "text,expected",
    [
        ("hello", True),
        ("你好", True),
        ("good morning", False),       # 短语不查
        ("def foo():\n    pass", False),  # 代码不查
        ("这是一个非常非常非常非常非常长的中文句子超过三十二个字符就不查了哦", False),
    ],
)
def test_needs_phonetics(text, expected):
    assert needs_phonetics(text) is expected


# ---------------------------------------------------------------------------
# get_phonetics —— Free Dictionary API 命中
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
@respx.mock
async def test_phonetics_from_dictionary_api(settings):
    respx.get("https://api.dictionaryapi.dev/api/v2/entries/en/hello").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "phonetic": "/həˈloʊ/",
                    "phonetics": [
                        {"text": "/həˈləʊ/", "audio": "hello-uk.mp3"},
                        {"text": "/həˈloʊ/", "audio": "hello-us.mp3"},
                    ],
                }
            ],
        )
    )
    result = await get_phonetics("hello", settings=settings, deepseek=None)
    assert result.uk == "/həˈləʊ/"
    assert result.us == "/həˈloʊ/"


@pytest.mark.asyncio
@respx.mock
async def test_phonetics_api_miss_falls_back_to_local(settings):
    # 词典 API 404，应落到 eng_to_ipa 本地兜底
    respx.get("https://api.dictionaryapi.dev/api/v2/entries/en/hello").mock(
        return_value=httpx.Response(404, json={"message": "not found"})
    )
    result = await get_phonetics("hello", settings=settings, deepseek=None)
    # eng_to_ipa 至少能给出某个 IPA
    assert result.ipa is not None and len(result.ipa) > 0


@pytest.mark.asyncio
async def test_phonetics_chinese_pinyin(settings):
    result = await get_phonetics("你好", settings=settings, deepseek=None)
    assert result.pinyin is not None
    # 带声调的拼音
    assert "nǐ" in result.pinyin.lower() or "ni3" in result.pinyin.lower()


@pytest.mark.asyncio
async def test_phonetics_phrase_returns_empty(settings):
    # 短语不查音标
    result = await get_phonetics("good morning", settings=settings, deepseek=None)
    assert result.ipa is None and result.pinyin is None


@pytest.mark.asyncio
async def test_phonetics_empty_text(settings):
    result = await get_phonetics("", settings=settings, deepseek=None)
    assert result.ipa is None
