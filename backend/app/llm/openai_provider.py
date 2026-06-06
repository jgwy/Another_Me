"""OpenAI-compatible provider using the **Chat Completions API** (openai 2.41.0).

This path talks to any OpenAI-compatible ``/chat/completions`` endpoint — the
hosted OpenAI API *and* gateways like **Aliyun DashScope's compatible-mode**
(``OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1``), which the
demo uses with ``deepseek-v4-pro``. DashScope does **not** implement the newer
Responses API, so we deliberately use chat/completions here.

Configuration (env): ``OPENAI_API_KEY`` (required), ``OPENAI_BASE_URL`` (optional
gateway), ``OPENAI_MODEL`` / ``LLM_MODEL`` (model name). Streaming is supported
via ``stream=True`` (deltas come from ``choice.delta.content``).
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator, Iterable, Mapping
from typing import Any

from openai import AsyncOpenAI

from app.core.config import get_settings
from app.llm.base import normalize_messages

# Reasoning models (e.g. DeepSeek-V*) emit a large hidden ``reasoning_content``
# stream that is billed against the same completion budget as the visible
# ``content``. If ``max_tokens`` only covers the visible answer, the model can
# exhaust the budget *while still thinking* and return truncated/empty content
# (``finish_reason == "length"``) — which silently degrades JSON synthesis and
# turn replies. We add a generous headroom so the requested visible budget is
# preserved on top of the thinking. ``max_tokens`` is a cap, not a target, so
# non-reasoning models are unaffected (they stop when done).
_REASONING_HEADROOM = 2048


class OpenAIProvider:
    name = "openai"

    def __init__(self) -> None:
        settings = get_settings()
        kwargs: dict[str, Any] = {"api_key": settings.openai_api_key}
        if settings.openai_base_url:
            kwargs["base_url"] = settings.openai_base_url
        self._client = AsyncOpenAI(**kwargs)
        # Per-provider override wins over the generic LLM_MODEL.
        self.model = os.environ.get("OPENAI_MODEL") or settings.llm_model or "gpt-4o-mini"

    @staticmethod
    def _budget(max_tokens: int) -> int:
        """Add reasoning headroom so a thinking model still emits full content."""
        return int(max_tokens) + _REASONING_HEADROOM

    def _payload(self, messages: Iterable[Any]) -> list[dict[str, str]]:
        """Flatten to a chat/completions ``messages`` array (system role kept inline)."""
        msgs = [{"role": m.role, "content": m.content} for m in normalize_messages(messages)]
        if not msgs:
            msgs = [{"role": "user", "content": "(请开始)"}]
        return msgs

    async def _create(self, *, stream: bool, **kwargs: Any) -> Any:
        """Call chat/completions, retrying without ``temperature`` if the model
        (e.g. some reasoning models) rejects a custom temperature."""
        try:
            return await self._client.chat.completions.create(stream=stream, **kwargs)
        except Exception as exc:  # noqa: BLE001
            if "temperature" in kwargs and "temperature" in str(exc).lower():
                kwargs.pop("temperature", None)
                return await self._client.chat.completions.create(stream=stream, **kwargs)
            raise

    async def complete(
        self,
        messages: Iterable[Any],
        *,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        meta: Mapping[str, Any] | None = None,
    ) -> str:
        resp = await self._create(
            stream=False,
            model=model or self.model,
            messages=self._payload(messages),
            max_tokens=self._budget(max_tokens),
            temperature=temperature,
        )
        choices = getattr(resp, "choices", None) or []
        if not choices:
            return ""
        return (choices[0].message.content or "") if choices[0].message else ""

    async def stream(
        self,
        messages: Iterable[Any],
        *,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        meta: Mapping[str, Any] | None = None,
    ) -> AsyncIterator[str]:
        events = await self._create(
            stream=True,
            model=model or self.model,
            messages=self._payload(messages),
            max_tokens=self._budget(max_tokens),
            temperature=temperature,
        )
        async for chunk in events:
            choices = getattr(chunk, "choices", None) or []
            if not choices:
                continue
            delta = getattr(choices[0], "delta", None)
            text = getattr(delta, "content", None) if delta else None
            if text:
                yield text
