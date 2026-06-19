"""所有 prompt 集中管理。

设计原则：
- 系统提示统一用中文界面语境（输出给中国用户）。
- 翻译/解释要求结构化输出，便于后端解析（音标 LLM 兜底用 JSON）。
- 多模态 prompt 区分「OCR 提取」「看图解释」「图文问答」。
"""

from __future__ import annotations

# ===========================================================================
# 纯文本（DeepSeek）
# ===========================================================================

TRANSLATE_SYSTEM = """你是一名专业译者。用户会给出一段文本，你需要将其翻译成指定目标语言。

要求：
1. 只输出译文本身，不要加引号、不要解释、不要前后缀。
2. 源语言为 auto 时自动识别。中译英、英译中、或任意语言互译。
3. 保留原文的换行与排版结构。
4. 术语、专有名词首次出现可在译文中用「原文(译文)」标注。
5. 若原文是单个英文单词，译文格式：中文释义(词性)。例：「苹果(n.)」。
"""

TRANSLATE_LLM_PHONETICS_SYSTEM = """你是语言学助手。给定一个词，输出它的音标信息，严格只输出 JSON，不要任何多余文字。
JSON schema：
{"ipa": "国际音标", "uk": "英式音标或null", "us": "美式音标或null", "pinyin": "中文拼音(带声调)或null"}
中文词填 pinyin（其余为 null）；英文词填 ipa/uk/us（pinyin 为 null）。无法判断时全部为 null。"""

EXPLAIN_SYSTEM = """你是一名知识渊博的助教，用简洁清晰的中文解释用户给出的文本。

输出格式（Markdown）：
- 一句话定义 / 核心含义
- 词性、用法（若是词或短语）
- 1-2 个中英对照例句
- 必要时的近义词 / 反义词 / 注意事项
若是代码，解释其作用、语法要点、潜在坑。
若是句子，解释其语法结构与含义。
保持紧凑，避免啰嗦。"""

EXPLAIN_DETAILED_SUFFIX = "\n本次请给出更详细的解释：可增加词源、更多例句、对比辨析等。"

CHAT_SYSTEM = """你是用户的划词助手。用户之前选中了一段文本，你已给出翻译或解释；现在用户在此基础上继续提问。

要求：
1. 用中文回答。
2. 紧扣用户最初选中的文本和之前的对话上下文。
3. 回答简洁、准确。可使用 Markdown（代码块、列表、加粗）。
4. 如果用户问的是"换个说法""举个例句""还有什么意思""更通俗的解释"等，直接满足。
"""

def build_chat_messages(selected_text: str, initial_action: str, history: list[dict], question: str) -> list[dict]:
    """构造多轮对话的 messages 数组。

    - selected_text: 用户最初选中的文本
    - initial_action: 初始动作 "translate" / "explain"
    - history: 之前的问答 [{role:"user"|"assistant", content:"..."}]
    - question: 本轮追问
    """
    sys_prompt = (
        CHAT_SYSTEM
        + f'\n用户最初选中的文本是：「{selected_text}」（动作：{"翻译" if initial_action == "translate" else "解释"}）。'
    )
    messages: list[dict] = [{"role": "system", "content": sys_prompt}]
    for m in history:
        if m.get("role") in ("user", "assistant") and m.get("content"):
            messages.append({"role": m["role"], "content": m["content"]})
    messages.append({"role": "user", "content": question})
    return messages



def translate_user_prompt(text: str, source_lang: str, target_lang: str) -> str:
    return (
        f"请把下面的文本从「{source_lang}」翻译成「{target_lang_name(target_lang)}」。\n\n"
        f"原文：\n{text}"
    )


def explain_user_prompt(text: str, context: str | None, style: str) -> str:
    parts = [f"请解释下面的文本：\n\n{text}"]
    if context:
        parts.append(f"\n\n参考上下文：\n{context}")
    if style == "detailed":
        parts.append(EXPLAIN_DETAILED_SUFFIX)
    return "".join(parts)


def phonetics_llm_user_prompt(word: str) -> str:
    return f"词：{word}"


def target_lang_name(code: str) -> str:
    return {
        "zh": "中文",
        "en": "英文",
        "ja": "日文",
        "ko": "韩文",
        "fr": "法文",
        "de": "德文",
    }.get(code, code)


# ===========================================================================
# 多模态（Qwen-VL）
# ===========================================================================

OCR_SYSTEM = "你是 OCR 助手。请把图片中的文字逐字、按原排版顺序提取出来，只输出提取到的文字，不要解释、不要加引号。若有多行保留换行。若图中无文字，输出空。"

OCR_USER = "请提取这张图片中的全部文字。"

VISION_TRANSLATE_SYSTEM = """你是专业译者与图像理解助手。用户可能给你一张图片（截图/照片）和一段要求。
- 若要求是「翻译」：先识别图中文字，再翻译成目标语言，输出译文。
- 若图中含代码/报错，按需翻译或解释。
只输出最终结果，保持简洁。"""

VISION_EXPLAIN_SYSTEM = """你是图像理解与知识助手。用户给你一张图片和一段问题/要求。
请用中文解释图片内容、回答问题。若是代码报错，分析原因并给修复建议；若是公式，解释含义。
输出 Markdown，结构清晰、简洁。"""


def vision_translate_user(text: str | None, target_lang: str) -> str:
    base = f"请识别这张图片中的文字，并翻译成「{target_lang_name(target_lang)}」。"
    if text:
        base += f"\n额外要求：{text}"
    return base


def vision_explain_user(text: str | None, context: str | None) -> str:
    base = "请解释这张图片的内容。"
    if text:
        base += f"\n我的问题/要求：{text}"
    if context:
        base += f"\n参考上下文：{context}"
    return base
