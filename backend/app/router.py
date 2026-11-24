"""API 路由层。

端点：
- POST /api/translate          翻译（纯文本 DeepSeek / 含图 Qwen-VL 自动路由），multipart
- POST /api/explain            解释（同上自动路由），multipart
- POST /api/translate/stream   翻译 SSE 流式
- POST /api/explain/stream     解释 SSE 流式
- POST /api/translate/vision   显式多模态翻译
- POST /api/explain/vision     显式多模态解释
- POST /api/ocr                纯 OCR 提取文字
- POST /api/selection          全局热键取词 → 返回类型与建议动作
- GET  /api/detect             文本类型检测

multipart 字段：text(可选), images(可选, 多文件)。
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sse_starlette.sse import EventSourceResponse

from .deps import (
    get_codex,
    get_deepseek,
    get_optional_qwen_vl,
    get_qwen_vl,
    request_model_backend,
    settings,
)
from .router_engine import images_to_data_urls, route
from .schemas import (
    Action,
    ChatRequest,
    ChatResponse,
    DetectResponse,
    ErrorResponse,
    ExplainResponse,
    OcrResponse,
    Phonetics,
    SelectionRequest,
    SelectionResponse,
    TextKind,
    TranslateResponse,
    VisionResponse,
)
from .services import chat as chat_svc
from .services import explain as explain_svc
from .services import translate as translate_svc
from .services import vision as vision_svc
from .services.codex import CodexClient, CodexError
from .services.deepseek import DeepSeekClient, DeepSeekError
from .services.phonetics import classify, needs_phonetics
from .services.qwen_vl import QwenVLClient, QwenVLError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["selection"])
MAX_IMAGES = 8
MAX_IMAGE_BYTES = 12 * 1024 * 1024


# ---------------------------------------------------------------------------
# 辅助
# ---------------------------------------------------------------------------
def _thinking_from_request(request: Request) -> Optional[bool]:
    """从请求头 X-Enable-Thinking 解析思考开关。

    - "1"/"true" -> True
    - "0"/"false" -> False
    - 缺省 -> None（用后端全局默认）
    """
    val = request.headers.get("x-enable-thinking")
    if val is None:
        return None
    v = val.strip().lower()
    if v in ("1", "true", "yes", "on"):
        return True
    if v in ("0", "false", "no", "off"):
        return False
    return None


async def _collect_images(files: list[UploadFile]) -> tuple[list[str], list[bytes]]:
    urls: list[str] = []
    raws: list[bytes] = []
    valid_files = [f for f in files if f is not None and f.filename]
    if len(valid_files) > MAX_IMAGES:
        raise _err("too_many_images", f"最多上传 {MAX_IMAGES} 张图片", 400)
    for f in valid_files:
        if f.content_type and not f.content_type.startswith("image/"):
            raise _err("unsupported_file", f"{f.filename} 不是支持的图片格式", 415)
        raw = await f.read()
        if not raw:
            continue
        if len(raw) > MAX_IMAGE_BYTES:
            raise _err("image_too_large", f"{f.filename} 超过 12 MB", 413)
        mime = f.content_type or "image/png"
        raws.append(raw)
        urls.extend(images_to_data_urls([raw], mime=mime))
    return urls, raws


def _err(code: str, message: str, status: int) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def _safe_route_qwen(decision_backend: str, qwen_vl: Optional[QwenVLClient | CodexClient]) -> QwenVLClient | CodexClient:
    if decision_backend == "qwen_vl":
        if qwen_vl is None:
            raise _err("multimodal_unavailable", "未配置 DASHSCOPE_API_KEY，多模态不可用", 503)
        return qwen_vl
    raise _err("internal", "路由异常", 500)


# ---------------------------------------------------------------------------
# 健康检查
# ---------------------------------------------------------------------------
@router.get("/health")
async def health(request: Request) -> dict:
    cfg = settings()
    if request_model_backend(request) == "codex":
        return {"ok": True, "provider": "codex", "model": cfg.codex_model, "effort": cfg.codex_reasoning_effort}
    status = {"ok": True, "provider": "dashscope", "model": cfg.dashscope_text_model}
    if cfg.dashscope_vision_model != cfg.dashscope_text_model:
        status["vision_model"] = cfg.dashscope_vision_model
    return status


@router.get("/models")
async def models(request: Request) -> dict:
    codex = get_codex() if request_model_backend(request) == "codex" else None
    if codex is None:
        return {"models": []}
    try:
        return {"models": await codex.models()}
    except CodexError as exc:
        raise _err(exc.code, str(exc), exc.status_code) from exc


# ---------------------------------------------------------------------------
# 文本检测 / 取词
# ---------------------------------------------------------------------------
@router.get("/detect", response_model=DetectResponse)
async def detect(text: str) -> DetectResponse:
    kind = classify(text)
    return DetectResponse(kind=TextKind(kind), needs_phonetics=needs_phonetics(text))


@router.post("/selection", response_model=SelectionResponse)
async def selection(req: SelectionRequest) -> SelectionResponse:
    """全局热键取词：返回类型、是否需要音标、建议动作。"""
    text = req.text.strip()
    kind = classify(text)
    np = needs_phonetics(text)
    actions = [Action.translate, Action.explain]
    return SelectionResponse(
        text=text, kind=TextKind(kind), needs_phonetics=np, suggested_actions=actions
    )


# ---------------------------------------------------------------------------
# 翻译
# ---------------------------------------------------------------------------
@router.post(
    "/translate",
    response_model=TranslateResponse,
    responses={502: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
async def translate(
    request: Request,
    text: Optional[str] = Form(default=None),
    source_lang: str = Form(default="auto"),
    target_lang: str = Form(default=None),
    images: list[UploadFile] = File(default_factory=list),
    deepseek: DeepSeekClient | CodexClient = Depends(get_deepseek),
    qwen_vl: Optional[QwenVLClient | CodexClient] = Depends(get_optional_qwen_vl),
) -> TranslateResponse:
    cfg = settings()
    tgt = target_lang or cfg.default_target_lang
    image_urls, _ = await _collect_images(images)
    decision = route(text, image_urls)

    try:
        if decision.backend == "qwen_vl":
            qv = _safe_route_qwen(decision.backend, qwen_vl)
            out = await translate_svc.translate_image(
                text=text, target_lang=tgt, image_urls=image_urls, qwen_vl=qv
            )
        else:
            if not text or not text.strip():
                raise _err("bad_request", "text 和 images 至少提供一个", 400)
            out = await translate_svc.translate_text(
                text=text,
                source_lang=source_lang,
                target_lang=tgt,
                settings=cfg,
                deepseek=deepseek,
                enable_thinking=_thinking_from_request(request),
            )
    except (DeepSeekError, QwenVLError, CodexError) as e:
        raise _err(e.code, str(e), e.status_code) from e

    return TranslateResponse(
        text=out.text,
        phonetics=out.phonetics,
        translation=out.translation,
        detected_lang=out.detected_lang,
        model=out.model,
        reasoning=out.reasoning,
    )


@router.post("/translate/vision", response_model=VisionResponse)
async def translate_vision(
    text: Optional[str] = Form(default=None),
    target_lang: str = Form(default=None),
    images: list[UploadFile] = File(default_factory=list),
    qwen_vl: QwenVLClient | CodexClient = Depends(get_qwen_vl),
) -> VisionResponse:
    cfg = settings()
    image_urls, _ = await _collect_images(images)
    if not image_urls:
        raise _err("bad_request", "至少提供一张图片", 400)
    try:
        out = await translate_svc.translate_image(
            text=text, target_lang=target_lang or cfg.default_target_lang,
            image_urls=image_urls, qwen_vl=qwen_vl,
        )
    except (QwenVLError, CodexError) as e:
        raise _err(e.code, str(e), e.status_code) from e
    return VisionResponse(answer=out.translation, model=out.model)


# ---------------------------------------------------------------------------
# 解释
# ---------------------------------------------------------------------------
@router.post(
    "/explain",
    response_model=ExplainResponse,
    responses={502: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
async def explain(
    request: Request,
    text: Optional[str] = Form(default=None),
    context: Optional[str] = Form(default=None),
    style: str = Form(default="concise"),
    images: list[UploadFile] = File(default_factory=list),
    deepseek: DeepSeekClient | CodexClient = Depends(get_deepseek),
    qwen_vl: Optional[QwenVLClient | CodexClient] = Depends(get_optional_qwen_vl),
) -> ExplainResponse:
    cfg = settings()
    image_urls, _ = await _collect_images(images)
    decision = route(text, image_urls)

    try:
        if decision.backend == "qwen_vl":
            qv = _safe_route_qwen(decision.backend, qwen_vl)
            out = await explain_svc.explain_image(
                text=text, context=context, image_urls=image_urls, qwen_vl=qv
            )
        else:
            if not text or not text.strip():
                raise _err("bad_request", "text 和 images 至少提供一个", 400)
            out = await explain_svc.explain_text(
                text=text, context=context, style=style,
                settings=cfg, deepseek=deepseek,
                enable_thinking=_thinking_from_request(request),
            )
    except (DeepSeekError, QwenVLError, CodexError) as e:
        raise _err(e.code, str(e), e.status_code) from e

    return ExplainResponse(
        text=out.text,
        phonetics=out.phonetics,
        explanation=out.explanation,
        model=out.model,
        reasoning=out.reasoning,
    )


@router.post("/explain/vision", response_model=VisionResponse)
async def explain_vision(
    text: Optional[str] = Form(default=None),
    context: Optional[str] = Form(default=None),
    images: list[UploadFile] = File(default_factory=list),
    qwen_vl: QwenVLClient | CodexClient = Depends(get_qwen_vl),
) -> VisionResponse:
    image_urls, _ = await _collect_images(images)
    if not image_urls:
        raise _err("bad_request", "至少提供一张图片", 400)
    try:
        out = await explain_svc.explain_image(
            text=text, context=context, image_urls=image_urls, qwen_vl=qwen_vl
        )
    except (QwenVLError, CodexError) as e:
        raise _err(e.code, str(e), e.status_code) from e
    return VisionResponse(answer=out.explanation, model=out.model)


# ---------------------------------------------------------------------------
# OCR
# ---------------------------------------------------------------------------
@router.post("/ocr", response_model=OcrResponse)
async def ocr_endpoint(
    images: list[UploadFile] = File(default_factory=list),
    qwen_vl: QwenVLClient | CodexClient = Depends(get_qwen_vl),
) -> OcrResponse:
    image_urls, _ = await _collect_images(images)
    if not image_urls:
        raise _err("bad_request", "至少提供一张图片", 400)
    try:
        result = await vision_svc.ocr(qwen_vl, image_urls)
    except (QwenVLError, CodexError) as e:
        raise _err(e.code, str(e), e.status_code) from e
    return OcrResponse(texts=result.texts, full_text=result.full_text, model=result.model)


# ---------------------------------------------------------------------------
# 多轮对话（追问）
# ---------------------------------------------------------------------------
@router.post(
    "/chat",
    response_model=ChatResponse,
    responses={502: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
async def chat_endpoint(
    request: Request,
    req: ChatRequest,
    deepseek: DeepSeekClient | CodexClient = Depends(get_deepseek),
) -> ChatResponse:
    """基于选中文本的多轮追问。前端维护 history，每次发完整历史。"""
    if not req.question.strip():
        raise _err("bad_request", "question 不能为空", 400)
    try:
        out = await chat_svc.chat(
            selected_text=req.selected_text,
            initial_action=req.initial_action,
            history=[m.model_dump() for m in req.history],
            question=req.question,
            deepseek=deepseek,
            enable_thinking=_thinking_from_request(request),
        )
    except (DeepSeekError, CodexError) as e:
        raise _err(e.code, str(e), e.status_code) from e
    return ChatResponse(answer=out.answer, model=out.model, reasoning=out.reasoning)


@router.post("/chat/stream")
async def chat_stream(
    request: Request,
    deepseek: DeepSeekClient | CodexClient = Depends(get_deepseek),
    qwen_vl: Optional[QwenVLClient | CodexClient] = Depends(get_optional_qwen_vl),
):
    """多轮 Chat SSE。

    兼容原 JSON 请求；multipart 请求可额外携带多个 images 字段。
    有图片自动走 Qwen-VL，无图继续走 DeepSeek。
    """
    enable_thinking = _thinking_from_request(request)
    content_type = request.headers.get("content-type", "")
    image_urls: list[str] = []

    try:
        if content_type.startswith("multipart/form-data"):
            form = await request.form()
            raw_history = str(form.get("history") or "[]")
            parsed_history = json.loads(raw_history)
            req = ChatRequest.model_validate(
                {
                    "selected_text": str(form.get("selected_text") or ""),
                    "initial_action": str(form.get("initial_action") or "chat"),
                    "history": parsed_history,
                    "question": str(form.get("question") or ""),
                }
            )
            files = [
                item
                for item in form.getlist("images")
                if hasattr(item, "filename") and hasattr(item, "read")
            ]
            image_urls, _ = await _collect_images(files)  # type: ignore[arg-type]
        else:
            req = ChatRequest.model_validate(await request.json())
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise _err("bad_request", f"Chat 请求格式错误: {exc}", 400) from exc

    async def gen():
        if not req.question.strip():
            yield _sse("error", {"code": "bad_request", "message": "question 不能为空"})
            return
        try:
            model = ""
            if image_urls:
                qv = _safe_route_qwen("qwen_vl", qwen_vl)
                async for chunk in chat_svc.stream_chat_with_images(
                    selected_text=req.selected_text,
                    initial_action=req.initial_action,
                    history=[m.model_dump() for m in req.history],
                    question=req.question,
                    image_urls=image_urls,
                    qwen_vl=qv,
                ):
                    model = model or chunk.model
                    if chunk.content:
                        yield _sse("delta", {"delta": chunk.content})
                yield _sse("done", {"model": model or qv.model})
            else:
                async for chunk in chat_svc.stream_chat(
                    selected_text=req.selected_text,
                    initial_action=req.initial_action,
                    history=[m.model_dump() for m in req.history],
                    question=req.question,
                    deepseek=deepseek,
                    enable_thinking=enable_thinking,
                ):
                    model = model or chunk.model
                    if chunk.reasoning:
                        yield _sse("thinking", {"delta": chunk.reasoning})
                    if chunk.content:
                        yield _sse("delta", {"delta": chunk.content})
                yield _sse("done", {"model": model or deepseek.model})
        except (DeepSeekError, QwenVLError, CodexError) as e:
            yield _sse("error", {"code": e.code, "message": str(e)})
        except Exception as e:  # noqa: BLE001
            logger.exception("chat/stream error")
            yield _sse("error", {"code": "internal", "message": str(e)})

    return EventSourceResponse(gen())


# ---------------------------------------------------------------------------
# SSE 流式：翻译 / 解释
# ---------------------------------------------------------------------------
def _sse(event: str, data: dict) -> dict:
    return {"event": event, "data": json.dumps(data, ensure_ascii=False)}


@router.post("/translate/stream")
async def translate_stream(
    request: Request,
    text: Optional[str] = Form(default=None),
    source_lang: str = Form(default="auto"),
    target_lang: str = Form(default=None),
    images: list[UploadFile] = File(default_factory=list),
    deepseek: DeepSeekClient | CodexClient = Depends(get_deepseek),
    qwen_vl: Optional[QwenVLClient | CodexClient] = Depends(get_optional_qwen_vl),
):
    cfg = settings()
    tgt = target_lang or cfg.default_target_lang
    image_urls, _ = await _collect_images(images)
    decision = route(text, image_urls)
    enable_thinking = _thinking_from_request(request)

    async def gen():
        try:
            if decision.backend == "qwen_vl":
                qv = _safe_route_qwen(decision.backend, qwen_vl)
                yield _sse("phonetics", {"phonetics": Phonetics().model_dump()})
                model = ""
                async for chunk in translate_svc.stream_translate_image(
                    text=text, target_lang=tgt, image_urls=image_urls, qwen_vl=qv
                ):
                    model = model or chunk.model
                    yield _sse("delta", {"delta": chunk.content})
                yield _sse("done", {"model": model or qv.model, "detected_lang": None})
            else:
                if not text or not text.strip():
                    yield _sse("error", {"code": "bad_request", "message": "text 和 images 至少提供一个"})
                    return
                phonetics, stream = await translate_svc.stream_translate_text(
                    text=text, source_lang=source_lang, target_lang=tgt,
                    settings=cfg, deepseek=deepseek,
                    enable_thinking=enable_thinking,
                )
                yield _sse("phonetics", {"phonetics": phonetics.model_dump()})
                model = ""
                async for chunk in stream:
                    model = model or chunk.model
                    if chunk.reasoning:
                        yield _sse("thinking", {"delta": chunk.reasoning})
                    if chunk.content:
                        yield _sse("delta", {"delta": chunk.content})
                yield _sse("done", {"model": model or deepseek.model, "detected_lang": None})
        except (DeepSeekError, QwenVLError, CodexError) as e:
            yield _sse("error", {"code": e.code, "message": str(e)})
        except HTTPException as e:
            detail = e.detail if isinstance(e.detail, dict) else {"message": str(e.detail)}
            yield _sse("error", {"code": detail.get("code", "error"), "message": detail.get("message", str(e.detail))})
        except Exception as e:  # noqa: BLE001
            logger.exception("translate/stream error")
            yield _sse("error", {"code": "internal", "message": str(e)})

    return EventSourceResponse(gen())


@router.post("/explain/stream")
async def explain_stream(
    request: Request,
    text: Optional[str] = Form(default=None),
    context: Optional[str] = Form(default=None),
    style: str = Form(default="concise"),
    images: list[UploadFile] = File(default_factory=list),
    deepseek: DeepSeekClient | CodexClient = Depends(get_deepseek),
    qwen_vl: Optional[QwenVLClient | CodexClient] = Depends(get_optional_qwen_vl),
):
    cfg = settings()
    image_urls, _ = await _collect_images(images)
    decision = route(text, image_urls)
    enable_thinking = _thinking_from_request(request)

    async def gen():
        try:
            if decision.backend == "qwen_vl":
                qv = _safe_route_qwen(decision.backend, qwen_vl)
                yield _sse("phonetics", {"phonetics": Phonetics().model_dump()})
                model = ""
                async for chunk in explain_svc.stream_explain_image(
                    text=text, context=context, image_urls=image_urls, qwen_vl=qv
                ):
                    model = model or chunk.model
                    yield _sse("delta", {"delta": chunk.content})
                yield _sse("done", {"model": model or qv.model, "detected_lang": None})
            else:
                if not text or not text.strip():
                    yield _sse("error", {"code": "bad_request", "message": "text 和 images 至少提供一个"})
                    return
                phonetics, stream = await explain_svc.stream_explain_text(
                    text=text, context=context, style=style,
                    settings=cfg, deepseek=deepseek,
                    enable_thinking=enable_thinking,
                )
                yield _sse("phonetics", {"phonetics": phonetics.model_dump()})
                model = ""
                async for chunk in stream:
                    model = model or chunk.model
                    if chunk.reasoning:
                        yield _sse("thinking", {"delta": chunk.reasoning})
                    if chunk.content:
                        yield _sse("delta", {"delta": chunk.content})
                yield _sse("done", {"model": model or deepseek.model, "detected_lang": None})
        except (DeepSeekError, QwenVLError, CodexError) as e:
            yield _sse("error", {"code": e.code, "message": str(e)})
        except HTTPException as e:
            detail = e.detail if isinstance(e.detail, dict) else {"message": str(e.detail)}
            yield _sse("error", {"code": detail.get("code", "error"), "message": detail.get("message", str(e.detail))})
        except Exception as e:  # noqa: BLE001
            logger.exception("explain/stream error")
            yield _sse("error", {"code": "internal", "message": str(e)})

    return EventSourceResponse(gen())
