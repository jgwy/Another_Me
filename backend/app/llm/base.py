"""Unified async LLM interface and provider factory.

Every provider implements the same two coroutines:

* ``complete(messages, ...) -> str`` — return the full assistant text.
* ``stream(messages, ...) -> AsyncIterator[str]`` — yield text deltas.

Messages are plain ``{"role", "content"}`` dicts (or :class:`LLMMessage`), where
``role`` is one of ``system`` / ``user`` / ``assistant``. The active provider is
chosen by ``LLM_PROVIDER`` / ``LLM_MODEL`` env vars. A deterministic ``mock``
provider lets the whole pipeline run and be tested WITHOUT any API keys.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Iterable, Mapping
from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable

from app.core.config import get_settings

logger = logging.getLogger("app.llm")


@dataclass
class LLMMessage:
    """A single chat message."""

    role: str
    content: str

    def as_dict(self) -> dict[str, str]:
        return {"role": self.role, "content": self.content}


def normalize_messages(messages: Iterable[Any]) -> list[LLMMessage]:
    """Coerce dicts / :class:`LLMMessage` into a list of :class:`LLMMessage`."""
    out: list[LLMMessage] = []
    for m in messages:
        if isinstance(m, LLMMessage):
            out.append(m)
        elif isinstance(m, Mapping):
            out.append(LLMMessage(role=str(m["role"]), content=str(m["content"])))
        else:  # pragma: no cover - defensive
            raise TypeError(f"unsupported message type: {type(m)!r}")
    return out


def split_system(messages: list[LLMMessage]) -> tuple[str, list[LLMMessage]]:
    """Split out system messages (joined) from the conversational turns."""
    system_parts = [m.content for m in messages if m.role == "system"]
    turns = [m for m in messages if m.role != "system"]
    return "\n\n".join(p for p in system_parts if p), turns


@runtime_checkable
class LLMProvider(Protocol):
    """Structural type implemented by every provider."""

    name: str
    model: str

    async def complete(
        self,
        messages: Iterable[Any],
        *,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        meta: Mapping[str, Any] | None = None,
    ) -> str: ...

    def stream(
        self,
        messages: Iterable[Any],
        *,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        meta: Mapping[str, Any] | None = None,
    ) -> AsyncIterator[str]: ...


_provider: LLMProvider | None = None


def _build_provider() -> LLMProvider:
    settings = get_settings()
    requested = (settings.llm_provider or "openai").strip().lower()

    # Import lazily so missing optional SDK config never breaks unrelated code.
    from app.llm.mock_provider import MockProvider

    if requested == "mock":
        logger.info("LLM provider: mock (deterministic, no API key needed)")
        return MockProvider(model=settings.llm_model or "mock-1")

    if requested == "anthropic":
        if not settings.anthropic_api_key:
            logger.warning("ANTHROPIC_API_KEY missing — falling back to deterministic mock provider")
            return MockProvider(model=settings.llm_model or "mock-1")
        from app.llm.anthropic_provider import AnthropicProvider

        logger.info("LLM provider: anthropic")
        return AnthropicProvider()

    if requested == "openai":
        if not settings.openai_api_key:
            logger.warning("OPENAI_API_KEY missing — falling back to deterministic mock provider")
            return MockProvider(model=settings.llm_model or "mock-1")
        from app.llm.openai_provider import OpenAIProvider

        logger.info("LLM provider: openai")
        return OpenAIProvider()

    logger.warning("unknown LLM_PROVIDER=%r — falling back to mock provider", requested)
    return MockProvider(model=settings.llm_model or "mock-1")


def get_provider() -> LLMProvider:
    """Return the configured provider singleton."""
    global _provider
    if _provider is None:
        _provider = _build_provider()
    return _provider


def reset_provider_cache() -> None:
    """Drop the cached provider (used by tests after changing env)."""
    global _provider, _fallback_mock
    _provider = None
    _fallback_mock = None


_fallback_mock: LLMProvider | None = None


def _get_fallback_mock() -> LLMProvider:
    """Cached deterministic mock used as a call-time safety net for real providers."""
    global _fallback_mock
    if _fallback_mock is None:
        from app.llm.mock_provider import MockProvider

        _fallback_mock = MockProvider(model=get_settings().llm_model or "mock-1")
    return _fallback_mock


async def complete(
    messages: Iterable[Any],
    *,
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 1024,
    meta: Mapping[str, Any] | None = None,
) -> str:
    """Convenience: full completion via the active provider.

    If a *real* provider call fails (e.g. invalid key, network/timeout, rate
    limit), fall back to the deterministic mock for this call so the pipeline
    never hard-fails. ``meta`` carries the mode the mock needs to render."""
    provider = get_provider()
    try:
        return await provider.complete(
            messages, model=model, temperature=temperature, max_tokens=max_tokens, meta=meta
        )
    except Exception as exc:  # noqa: BLE001
        if provider.name == "mock":
            raise
        logger.warning("LLM provider %r failed (%s) — falling back to mock for this call", provider.name, exc)
        return await _get_fallback_mock().complete(
            messages, model=model, temperature=temperature, max_tokens=max_tokens, meta=meta
        )


async def stream(
    messages: Iterable[Any],
    *,
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 1024,
    meta: Mapping[str, Any] | None = None,
) -> AsyncIterator[str]:
    """Convenience: streaming deltas via the active provider.

    Mirrors :func:`complete`'s safety net: if a real provider errors before the
    first token, fall back to the mock stream; if it errors mid-stream, stop
    gracefully (the partial text is already persisted upstream)."""
    provider = get_provider()
    if provider.name == "mock":
        async for delta in provider.stream(
            messages, model=model, temperature=temperature, max_tokens=max_tokens, meta=meta
        ):
            yield delta
        return

    gen = provider.stream(messages, model=model, temperature=temperature, max_tokens=max_tokens, meta=meta)
    try:
        first = await gen.__anext__()
    except StopAsyncIteration:
        return
    except Exception as exc:  # noqa: BLE001 - connect-time failure → fall back fully
        logger.warning("LLM provider %r stream failed (%s) — falling back to mock", provider.name, exc)
        async for delta in _get_fallback_mock().stream(
            messages, model=model, temperature=temperature, max_tokens=max_tokens, meta=meta
        ):
            yield delta
        return

    yield first
    try:
        async for delta in gen:
            yield delta
    except Exception as exc:  # noqa: BLE001 - mid-stream failure → stop with partial output
        logger.warning("LLM provider %r stream interrupted (%s)", provider.name, exc)
        return
