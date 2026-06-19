"""请求 / 响应 / SSE 事件的数据模型。

注意：FastAPI 的表单端点（multipart）无法直接用 Pydantic 模型接收 `images: list[UploadFile]`，
那些端点在 router 层用 `Form(...)` / `File(...)` 显式声明，这里只定义 JSON 端点和响应体。
"""

from __future__ import annotations

from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# 枚举
# ---------------------------------------------------------------------------
class Action(str, Enum):
    translate = "translate"
    explain = "explain"


class TextKind(str, Enum):
    word = "word"          # 单个英文单词
    phrase = "phrase"      # 英文短语
    sentence = "sentence"  # 英文句子
    chinese = "chinese"    # 中文
    code = "code"          # 代码
    other = "other"


# ---------------------------------------------------------------------------
# 请求模型
# ---------------------------------------------------------------------------
class TranslateRequest(BaseModel):
    text: Optional[str] = Field(default=None, description="选中的纯文本")
    source_lang: str = Field(default="auto", description="源语言, auto=自动检测")
    target_lang: str = Field(default="zh", description="目标语言")


class ExplainRequest(BaseModel):
    text: Optional[str] = Field(default=None, description="选中的纯文本")
    context: Optional[str] = Field(default=None, description="额外上下文")
    style: Literal["concise", "detailed"] = "concise"


class SelectionRequest(BaseModel):
    """全局热键取词端点请求体。

    前端在热键（如 Ctrl+Shift+D）触发时，把抓到的选区 / 剪贴板文本 POST 上来。
    """

    text: str = Field(..., description="选区或剪贴板文本")
    source_app: Optional[str] = Field(
        default=None, description="来源应用名（可选，用于兼容性诊断）"
    )


class DetectRequest(BaseModel):
    text: str


# ---------------------------------------------------------------------------
# 响应模型
# ---------------------------------------------------------------------------
class Phonetics(BaseModel):
    ipa: Optional[str] = None
    uk: Optional[str] = None
    us: Optional[str] = None
    pinyin: Optional[str] = None


class ErrorResponse(BaseModel):
    error: dict  # {"code": str, "message": str}


class TranslateResponse(BaseModel):
    text: str
    phonetics: Phonetics
    translation: str
    detected_lang: Optional[str] = None
    model: str
    reasoning: Optional[str] = Field(
        default=None, description="DeepSeek reasoning 系列 thinking 内容（可隐藏）"
    )


class ExplainResponse(BaseModel):
    text: str
    phonetics: Phonetics
    explanation: str  # Markdown
    model: str
    reasoning: Optional[str] = None


class SelectionResponse(BaseModel):
    text: str
    kind: TextKind
    needs_phonetics: bool
    suggested_actions: list[Action]


class DetectResponse(BaseModel):
    kind: TextKind
    needs_phonetics: bool


class OcrResponse(BaseModel):
    texts: list[str]
    full_text: str
    model: str


class VisionResponse(BaseModel):
    """看图解释 / 图文问答通用响应。"""

    answer: str  # Markdown
    model: str


# ---------------------------------------------------------------------------
# 多轮对话（追问）
# ---------------------------------------------------------------------------
class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    """多轮追问。前端维护完整历史，每次把历史一起发上来。"""

    selected_text: str = Field(..., description="用户最初选中的文本")
    initial_action: Literal["translate", "explain"] = Field(
        default="explain", description="初始动作"
    )
    history: list[ChatMessage] = Field(
        default_factory=list, description="之前的多轮问答（不含本轮）"
    )
    question: str = Field(..., description="本轮追问")


class ChatResponse(BaseModel):
    answer: str  # Markdown
    model: str
    reasoning: Optional[str] = None


# ---------------------------------------------------------------------------
# SSE 事件 payload
# ---------------------------------------------------------------------------
class SsePhonetics(BaseModel):
    phonetics: Phonetics


class SseDelta(BaseModel):
    delta: str


class SseThinking(BaseModel):
    """reasoning_content 增量（可隐藏展示）。"""

    delta: str


class SseDone(BaseModel):
    model: str
    detected_lang: Optional[str] = None


class SseError(BaseModel):
    code: str
    message: str
