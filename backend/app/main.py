"""FastAPI 应用入口。

启动：
    uv run uvicorn app.main:app --reload --port 8000

lifespan 负责创建/关闭共享 HTTP 客户端与模型客户端单例。
"""

from __future__ import annotations

import logging
from hmac import compare_digest
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .deps import close_clients, init_clients
from .router import router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("doubao-selection")


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = get_settings()
    init_clients(cfg)
    missing = cfg.warn_missing_keys()
    if cfg.model_backend == "codex":
        logger.info("Codex app-server：%s (%s)", cfg.codex_model, cfg.codex_reasoning_effort)
    elif missing:
        logger.warning("⚠️  缺少以下密钥，相关功能将不可用：\n  - %s", "\n  - ".join(missing))
        logger.warning("请在 .env 中配置（参考 .env.example）。纯文本/多模态端点会返回 503。")
    else:
        logger.info("百炼客户端就绪，文本 %s，视觉 %s", cfg.dashscope_text_model, cfg.dashscope_vision_model)
    try:
        yield
    finally:
        await close_clients()


def create_app() -> FastAPI:
    cfg = get_settings()
    app = FastAPI(
        title="豆包式划词后端",
        description="划词翻译、解释、聊天与图文识别。",
        version="0.1.0",
        lifespan=lifespan,
    )
    @app.middleware("http")
    async def protect_model_requests(request: Request, call_next):
        path = request.url.path
        model_backend = request.headers.get("x-model-backend")
        if (request.method == "POST" and path.startswith("/api/")) or (
            request.method == "GET" and (
                path == "/api/models" or (path == "/api/health" and model_backend is not None)
            )
        ):
            origin = request.headers.get("origin")
            if cfg.local_token:
                token = request.headers.get("x-selection-token", "")
                authorized = compare_digest(token.encode(), cfg.local_token.encode())
            else:
                authorized = origin is None or origin in cfg.cors_origin_list
            if not authorized:
                return JSONResponse(
                    {"detail": {"code": "forbidden", "message": "此服务仅接受已授权的本地请求。"}},
                    status_code=403,
                )
            if cfg.local_token and model_backend is not None:
                if model_backend not in ("dashscope", "codex"):
                    return JSONResponse(
                        {"detail": {"code": "invalid_model_backend", "message": "请选择阿里云百炼或 Codex。"}},
                        status_code=400,
                    )
                request.state.model_backend = model_backend
        return await call_next(request)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[*cfg.cors_origin_list, "null"] if cfg.local_token else cfg.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    return app


app = create_app()
