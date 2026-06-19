"""共享 fixture：构造配置、客户端、用 respx mock 外部 API。"""

from __future__ import annotations

import httpx
import pytest

from app.config import Settings
from app.deps import init_clients
from app.services.deepseek import DeepSeekClient
from app.services.qwen_vl import QwenVLClient


@pytest.fixture
def settings() -> Settings:
    return Settings(
        DEEPSEEK_API_KEY="sk-test-deepseek",
        DEEPSEEK_BASE_URL="https://api.deepseek.com",
        DEEPSEEK_MODEL="deepseek-v4-pro",
        DASHSCOPE_API_KEY="sk-test-dashscope",
        QWEN_VL_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1",
        QWEN_VL_MODEL="qwen-vl-max",
    )


@pytest.fixture
def http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(trust_env=False)


@pytest.fixture
def deepseek(settings, http_client) -> DeepSeekClient:
    return DeepSeekClient(settings, http_client)


@pytest.fixture
def qwen_vl(settings, http_client) -> QwenVLClient:
    return QwenVLClient(settings, http_client)
