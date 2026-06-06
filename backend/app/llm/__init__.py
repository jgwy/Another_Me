"""LLM abstraction: unified async ``complete`` / ``stream`` over OpenAI,
Anthropic, and a deterministic key-free ``mock`` provider.

Usage::

    from app import llm
    text = await llm.complete(messages, meta={"mode": "chat", ...})
    async for delta in llm.stream(messages, meta={...}):
        ...

Provider is selected by ``LLM_PROVIDER`` / ``LLM_MODEL`` env vars; missing API
keys for a real provider fall back to ``mock`` so the stack always boots.
"""

from app.llm.base import (
    LLMMessage,
    LLMProvider,
    complete,
    get_provider,
    normalize_messages,
    reset_provider_cache,
    stream,
)

__all__ = [
    "LLMMessage",
    "LLMProvider",
    "complete",
    "stream",
    "get_provider",
    "reset_provider_cache",
    "normalize_messages",
]
