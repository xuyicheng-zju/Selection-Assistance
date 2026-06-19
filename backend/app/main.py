"""FastAPI 应用入口。

启动：
    uv run uvicorn app.main:app --reload --port 8000

lifespan 负责创建/关闭共享 HTTP 客户端与模型客户端单例。
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
    if missing:
        logger.warning("⚠️  缺少以下密钥，相关功能将不可用：\n  - %s", "\n  - ".join(missing))
        logger.warning("请在 .env 中配置（参考 .env.example）。纯文本/多模态端点会返回 503。")
    else:
        logger.info("✅ DeepSeek + Qwen-VL 客户端就绪")
    logger.info("DeepSeek 模型: %s | Qwen-VL 模型: %s", cfg.deepseek_model, cfg.qwen_vl_model)
    yield
    await close_clients()


def create_app() -> FastAPI:
    cfg = get_settings()
    app = FastAPI(
        title="豆包式划词后端",
        description="划词翻译/解释 —— 纯文本走 DeepSeek，含图自动切 Qwen-VL（多模态）。",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    return app


app = create_app()
