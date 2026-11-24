"""从环境变量和 .env 读取应用配置。"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ModelBackend = Literal["dashscope", "codex"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    model_backend: ModelBackend = Field(default="dashscope", alias="MODEL_BACKEND")
    codex_app_server_bin: str = Field(default="codex", alias="CODEX_APP_SERVER_BIN")
    codex_model: str = Field(default="gpt-6.1-terra", alias="CODEX_MODEL")
    codex_reasoning_effort: Literal["low", "medium", "high", "xhigh", "max", "ultra"] = Field(
        default="low", alias="CODEX_REASONING_EFFORT"
    )
    local_token: str = Field(default="", alias="SELECTION_LOCAL_TOKEN", repr=False)

    # ===== 百炼统一接入 =====
    dashscope_api_key: str = Field(default="", alias="DASHSCOPE_API_KEY", repr=False)
    dashscope_base_url: str = Field(
        default="https://dashscope.aliyuncs.com/compatible-mode/v1",
        alias="DASHSCOPE_BASE_URL",
    )
    dashscope_model: str | None = Field(default=None, alias="DASHSCOPE_MODEL")

    # 纯文本模型（DeepSeek）
    deepseek_model: str = Field(default="deepseek-v4-pro", alias="DEEPSEEK_MODEL")
    # 支持思考开关的百炼模型默认关闭思考。
    enable_thinking: bool = Field(default=False, alias="ENABLE_THINKING")

    # 多模态模型（Qwen-VL）
    qwen_vl_model: str = Field(default="qwen-vl-max", alias="QWEN_VL_MODEL")

    # 通用
    default_target_lang: str = Field(default="zh", alias="DEFAULT_TARGET_LANG")
    local_phonetics_only: bool = Field(default=False, alias="LOCAL_PHONETICS_ONLY")
    http_timeout_connect: float = Field(default=10.0, alias="HTTP_TIMEOUT_CONNECT")
    http_timeout_stream: float = Field(default=120.0, alias="HTTP_TIMEOUT_STREAM")
    cors_origins: str = Field(
        default="http://localhost:5173,http://localhost:3000,http://localhost:8080",
        alias="CORS_ORIGINS",
    )

    @property
    def dashscope_text_model(self) -> str:
        return self.dashscope_model or self.deepseek_model

    @property
    def dashscope_vision_model(self) -> str:
        return self.dashscope_model or self.qwen_vl_model

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def warn_missing_keys(self) -> list[str]:
        """返回缺失密钥的提示列表（不抛错，调用方决定是否打印）。"""
        missing: list[str] = []
        if self.model_backend == "dashscope" and not self.dashscope_api_key:
            missing.append("DASHSCOPE_API_KEY (翻译/解释/OCR/看图全部不可用)")
        return missing


@lru_cache
def get_settings() -> Settings:
    return Settings()
