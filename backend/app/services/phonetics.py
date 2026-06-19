"""混合音标链：词典 API 优先 → 本地兜底 → LLM 兜底。

任一级失败都不阻塞主流程。对短语/句子/代码不查音标（needs_phonetics=False）。

并发执行各数据源，谁先成功用谁；全部失败返回空 Phonetics。
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Optional

import httpx
from pypinyin import lazy_pinyin, Style

from ..config import Settings
from ..schemas import Phonetics
from .deepseek import DeepSeekClient
from .. import prompts

logger = logging.getLogger(__name__)

# 中文：含 CJK 统一表意文字
_CJK_RE = re.compile(r"[\u4e00-\u9fff]")
# 英文单词（允许连字符，但不能含空格）
_EN_WORD_RE = re.compile(r"^[A-Za-z][A-Za-z\-']*$")
# 英文短语/句子：含字母与空格
_EN_PHRASE_RE = re.compile(r"[A-Za-z]")


def classify(text: str) -> str:
    """粗略判断文本类型，决定是否需要音标。

    返回 word / phrase / sentence / chinese / code / other。
    """
    text = text.strip()
    if not text:
        return "other"
    if _looks_like_code(text):
        return "code"
    # 中文
    if _CJK_RE.search(text):
        # 混合中英也归 chinese（音标取拼音）
        return "chinese"
    # 纯英文
    tokens = text.split()
    if len(tokens) == 1 and _EN_WORD_RE.match(tokens[0]):
        return "word"
    if _EN_PHRASE_RE.search(text):
        return "phrase" if len(tokens) <= 6 else "sentence"
    return "other"


def _looks_like_code(text: str) -> bool:
    """启发式判断是否为代码。多行 + 代码特征，或单行明显的函数定义。"""
    code_keywords = (
        "def ", "func ", "function ", "class ", "import ", "package ",
        "console.log", "printf(", "std::", "->", "::", "=>",
        "SELECT ", "INSERT ", "console.",
    )
    code_punct = ("{", "};", "();", "});")
    # 多行：只要含一个强特征（关键字定义）即判为代码
    multi_line = "\n" in text
    if multi_line and any(k in text for k in code_keywords):
        return True
    # 单行/多行：累计特征计数
    hits = sum(1 for s in code_keywords if s in text) + sum(
        1 for s in code_punct if s in text
    )
    return hits >= 2


def needs_phonetics(text: str) -> bool:
    """只有单个英文单词或（短）中文才查音标。"""
    kind = classify(text)
    return kind in ("word", "chinese") and len(text.strip()) <= 32


# ---------------------------------------------------------------------------
# 各数据源
# ---------------------------------------------------------------------------
async def _from_free_dictionary(text: str) -> Optional[Phonetics]:
    """Free Dictionary API（英文）。"""
    url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{text.strip().lower()}"
    try:
        async with httpx.AsyncClient(timeout=6.0, trust_env=False) as client:
            resp = await client.get(url)
    except httpx.HTTPError:
        return None
    if resp.status_code != 200:
        return None
    data = resp.json()
    if not isinstance(data, list) or not data:
        return None
    entry = data[0]
    ipa = entry.get("phonetic")
    uk = us = None
    for ph in entry.get("phonetics", []) or []:
        val = ph.get("text")
        if not val:
            continue
        audio = ph.get("audio", "") or ""
        if not ipa:
            ipa = val
        if "uk" in audio.lower():
            uk = val
        elif "us" in audio.lower():
            us = val
        # 没有 audio 区分时，第二个值当 us
        if uk is None and us is None and ipa and val != ipa:
            us = val
    return Phonetics(ipa=ipa, uk=uk, us=us)


def _from_local_en(text: str) -> Optional[Phonetics]:
    """eng_to_ipa 本地兜底（英文）。"""
    try:
        import eng_to_ipa as ipa  # type: ignore
    except Exception:  # pragma: no cover - 依赖可选
        return None
    try:
        converted = ipa.convert(text.strip())
    except Exception:
        return None
    if converted and converted.strip().lower() not in {"/", "*"}:
        return Phonetics(ipa=converted)
    return None


def _pinyin(text: str) -> Optional[Phonetics]:
    """pypinyin 中文拼音（本地，不会失败）。"""
    try:
        py = " ".join(lazy_pinyin(text, style=Style.TONE))
        if py and py.strip():
            return Phonetics(pinyin=py)
    except Exception:  # pragma: no cover
        return None
    return None


async def _from_llm(deepseek: Optional[DeepSeekClient], text: str) -> Optional[Phonetics]:
    """LLM 兜底（生僻词/专有名词）。"""
    if deepseek is None:
        return None
    try:
        result = await deepseek.chat(
            system=prompts.TRANSLATE_LLM_PHONETICS_SYSTEM,
            user=prompts.phonetics_llm_user_prompt(text.strip()),
            temperature=0.0,
            max_tokens=128,
        )
    except Exception:
        return None
    try:
        obj = json.loads(result.content.strip().strip("`"))
    except Exception:
        return None
    return Phonetics(
        ipa=obj.get("ipa"),
        uk=obj.get("uk"),
        us=obj.get("us"),
        pinyin=obj.get("pinyin"),
    )


# ---------------------------------------------------------------------------
# 对外入口
# ---------------------------------------------------------------------------
async def get_phonetics(
    text: str,
    *,
    settings: Settings,
    deepseek: Optional[DeepSeekClient] = None,
) -> Phonetics:
    """获取音标。不需要时返回空 Phonetics；并发各源取最先成功。"""
    if not text or not text.strip():
        return Phonetics()
    if not needs_phonetics(text):
        return Phonetics()

    kind = classify(text)

    if kind == "chinese":
        # 拼音本地即可，再叠加 LLM 兜底
        local = _pinyin(text)
        llm = await _from_llm(deepseek, text)
        return Phonetics(
            pinyin=(local.pinyin if local else None) or (llm.pinyin if llm else None),
        )

    # kind == word（英文单词）
    api_task = _from_free_dictionary(text)
    local_task = asyncio.to_thread(_from_local_en, text)
    api, local = await asyncio.gather(api_task, local_task)
    if api and (api.ipa or api.uk or api.us):
        return api
    if local and local.ipa:
        return local
    # 兜底 LLM
    llm = await _from_llm(deepseek, text)
    if llm and (llm.ipa or llm.uk or llm.us):
        return llm
    return Phonetics()
