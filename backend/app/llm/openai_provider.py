"""OpenAI provider using the **Responses API** (openai 2.41.0).

System messages are passed via ``instructions``; the remaining turns go to
``input`` as ``{"role", "content"}`` items. Streaming consumes
``response.output_text.delta`` events.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterable, Mapping
from typing import Any

from openai import AsyncOpenAI

from app.core.config import get_settings
from app.llm.base import normalize_messages, split_system


class OpenAIProvider:
    name = "openai"

    def __init__(self) -> None:
        settings = get_settings()
        kwargs: dict[str, Any] = {"api_key": settings.openai_api_key}
        if settings.openai_base_url:
            kwargs["base_url"] = settings.openai_base_url
        self._client = AsyncOpenAI(**kwargs)
        # Per-provider override wins over the generic LLM_MODEL.
        import os

        self.model = os.environ.get("OPENAI_MODEL") or settings.llm_model or "gpt-5-mini"

    def _build(self, messages: Iterable[Any]) -> tuple[str, list[dict[str, str]]]:
        msgs = normalize_messages(messages)
        system, turns = split_system(msgs)
        payload = [{"role": m.role, "content": m.content} for m in turns]
        if not payload:
            payload = [{"role": "user", "content": "(请开始)"}]
        return system, payload

    async def _create(self, *, stream: bool, **kwargs: Any) -> Any:
        """Call the Responses API, retrying without ``temperature`` if a model
        (e.g. reasoning models like gpt-5) rejects it."""
        try:
            return await self._client.responses.create(stream=stream, **kwargs)
        except Exception as exc:  # noqa: BLE001
            if "temperature" in kwargs and "temperature" in str(exc).lower():
                kwargs.pop("temperature", None)
                return await self._client.responses.create(stream=stream, **kwargs)
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
        system, payload = self._build(messages)
        resp = await self._create(
            stream=False,
            model=model or self.model,
            input=payload,
            instructions=system or None,
            max_output_tokens=max_tokens,
            temperature=temperature,
        )
        return resp.output_text or ""

    async def stream(
        self,
        messages: Iterable[Any],
        *,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        meta: Mapping[str, Any] | None = None,
    ) -> AsyncIterator[str]:
        system, payload = self._build(messages)
        events = await self._create(
            stream=True,
            model=model or self.model,
            input=payload,
            instructions=system or None,
            max_output_tokens=max_tokens,
            temperature=temperature,
        )
        async for event in events:
            if getattr(event, "type", None) == "response.output_text.delta":
                delta = getattr(event, "delta", "")
                if delta:
                    yield delta
