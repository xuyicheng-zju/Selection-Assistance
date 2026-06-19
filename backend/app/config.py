"""应用配置 —— 从环境变量 / .env 读取。

所有大模型调用统一走阿里云百炼（DashScope）的 OpenAI 兼容端点：
- 纯文本翻译/解释 → DeepSeek（deepseek-v4-pro，支持 enable_thinking）
- 多模态/OCR/看图 → Qwen-VL（qwen-vl-max）

两者共用同一个 DASHSCOPE_API_KEY 与 base_url，只需管理一个密钥。
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ===== 百炼统一接入（DeepSeek + Qwen-VL 共用） =====
    dashscope_api_key: str = Field(default="", alias="DASHSCOPE_API_KEY")
    dashscope_base_url: str = Field(
        default="https://dashscope.aliyuncs.com/compatible-mode/v1",
        alias="DASHSCOPE_BASE_URL",
    )

    # 纯文本模型（DeepSeek）
    deepseek_model: str = Field(default="deepseek-v4-pro", alias="DEEPSEEK_MODEL")
    # DeepSeek 思考模式：流式输出 reasoning_content（思考）+ content（回复）。默认关闭（更快）。
    enable_thinking: bool = Field(default=False, alias="ENABLE_THINKING")

    # 多模态模型（Qwen-VL）
    qwen_vl_model: str = Field(default="qwen-vl-max", alias="QWEN_VL_MODEL")

    # 通用
    default_target_lang: str = Field(default="zh", alias="DEFAULT_TARGET_LANG")
    http_timeout_connect: float = Field(default=10.0, alias="HTTP_TIMEOUT_CONNECT")
    http_timeout_stream: float = Field(default=120.0, alias="HTTP_TIMEOUT_STREAM")
    cors_origins: str = Field(
        default="http://localhost:5173,http://localhost:3000,http://localhost:8080",
        alias="CORS_ORIGINS",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def warn_missing_keys(self) -> list[str]:
        """返回缺失密钥的提示列表（不抛错，调用方决定是否打印）。"""
        missing: list[str] = []
        if not self.dashscope_api_key:
            missing.append("DASHSCOPE_API_KEY (翻译/解释/OCR/看图全部不可用)")
        return missing


@lru_cache
def get_settings() -> Settings:
    return Settings()
