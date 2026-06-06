"""Anthropic provider using the **Messages API** (anthropic 0.106.0).

System text is passed via ``system=``; turns are user/assistant items. Anthropic
requires the turns to start with ``user`` and to alternate, so consecutive
same-role messages are merged and a leading ``user`` is ensured.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterable, Mapping
from typing import Any

from anthropic import AsyncAnthropic

from app.core.config import get_settings
from app.llm.base import normalize_messages, split_system


def _prep_turns(turns: list[dict[str, str]]) -> list[dict[str, str]]:
    """Ensure a leading user turn and strict role alternation (merge dupes)."""
    out: list[dict[str, str]] = []
    for t in turns:
        role = "assistant" if t["role"] == "assistant" else "user"
        if out and out[-1]["role"] == role:
            out[-1]["content"] += "\n\n" + t["content"]
        else:
            out.append({"role": role, "content": t["content"]})
    if not out or out[0]["role"] != "user":
        out.insert(0, {"role": "user", "content": "(请开始)"})
    return out


class AnthropicProvider:
    name = "anthropic"

    def __init__(self) -> None:
        settings = get_settings()
        kwargs: dict[str, Any] = {"api_key": settings.anthropic_api_key}
        if settings.anthropic_base_url:
            kwargs["base_url"] = settings.anthropic_base_url
        self._client = AsyncAnthropic(**kwargs)
        import os

        self.model = os.environ.get("ANTHROPIC_MODEL") or settings.llm_model or "claude-3-7-sonnet"

    def _build(self, messages: Iterable[Any]) -> tuple[str, list[dict[str, str]]]:
        msgs = normalize_messages(messages)
        system, turns = split_system(msgs)
        payload = _prep_turns([{"role": m.role, "content": m.content} for m in turns])
        return system, payload

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
        msg = await self._client.messages.create(
            model=model or self.model,
            max_tokens=max_tokens,
            system=system or "",
            messages=payload,
            temperature=temperature,
        )
        return "".join(getattr(block, "text", "") for block in msg.content)

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
        async with self._client.messages.stream(
            model=model or self.model,
            max_tokens=max_tokens,
            system=system or "",
            messages=payload,
            temperature=temperature,
        ) as stream:
            async for text in stream.text_stream:
                if text:
                    yield text
