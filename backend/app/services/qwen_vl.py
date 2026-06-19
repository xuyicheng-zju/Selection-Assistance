"""Qwen-VL 客户端 —— DashScope OpenAI 兼容端点（多模态）。

支持纯文本对话、图文混合对话、流式。图像以 data URL 或 http URL 形式传入。
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import AsyncIterator, Optional

import httpx

from ..config import Settings


class QwenVLError(RuntimeError):
    def __init__(self, message: str, status_code: int = 502, code: str = "qwen_vl_error"):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


@dataclass(slots=True)
class VChatResult:
    content: str
    model: str


@dataclass(slots=True)
class VStreamChunk:
    content: str = ""
    model: str = ""


class QwenVLClient:
    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self._settings = settings
        self._client = client

    @property
    def model(self) -> str:
        return self._settings.qwen_vl_model

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._settings.dashscope_api_key}",
            "Content-Type": "application/json",
        }

    async def chat(
        self,
        prompt: str,
        image_urls: list[str],
        *,
        system: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 2048,
    ) -> VChatResult:
        content: list[dict] = []
        for url in image_urls:
            content.append({"type": "image_url", "image_url": {"url": url}})
        content.append({"type": "text", "text": prompt})
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": content})

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        }
        url = f"{self._settings.dashscope_base_url}/chat/completions"
        try:
            resp = await self._client.post(url, json=payload, headers=self._headers())
        except httpx.HTTPError as exc:
            raise QwenVLError(f"Qwen-VL 网络错误: {exc}", code="network") from exc
        if resp.status_code >= 400:
            raise QwenVLError(
                f"Qwen-VL 返回 {resp.status_code}: {resp.text[:300]}",
                status_code=_map_status(resp.status_code),
            )
        data = resp.json()
        choice = (data.get("choices") or [{}])[0].get("message", {})
        return VChatResult(content=choice.get("content") or "", model=data.get("model", self.model))

    async def stream(
        self,
        prompt: str,
        image_urls: list[str],
        *,
        system: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 2048,
    ) -> AsyncIterator[VStreamChunk]:
        content: list[dict] = []
        for url in image_urls:
            content.append({"type": "image_url", "image_url": {"url": url}})
        content.append({"type": "text", "text": prompt})
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": content})

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        url = f"{self._settings.dashscope_base_url}/chat/completions"
        try:
            async with self._client.stream(
                "POST", url, json=payload, headers=self._headers()
            ) as resp:
                if resp.status_code >= 400:
                    body = await resp.aread()
                    raise QwenVLError(
                        f"Qwen-VL 返回 {resp.status_code}: {body[:300]!r}",
                        status_code=_map_status(resp.status_code),
                    )
                async for line in resp.aiter_lines():
                    chunk = _parse_sse_line(line)
                    if chunk is not None:
                        yield chunk
        except QwenVLError:
            raise
        except httpx.HTTPError as exc:
            raise QwenVLError(f"Qwen-VL 流式网络错误: {exc}", code="network") from exc


def _map_status(status: int) -> int:
    if status == 401:
        return 503
    if status == 429:
        return 429
    return 502


def _parse_sse_line(line: str) -> Optional[VStreamChunk]:
    line = line.strip()
    if not line or not line.startswith("data:"):
        return None
    data = line[5:].strip()
    if data == "[DONE]":
        return None
    try:
        obj = json.loads(data)
    except json.JSONDecodeError:
        return None
    choice = (obj.get("choices") or [{}])[0]
    delta = choice.get("delta", {}) or {}
    content = delta.get("content") or ""
    if not content:
        return None
    return VStreamChunk(content=content, model=obj.get("model", ""))
