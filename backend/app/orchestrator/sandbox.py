"""Async client for the isolated sandbox-runner service.

Posts code to ``SANDBOX_URL/run`` and returns the locked result shape. Never
raises: on transport/timeout failure it returns a result with a non-zero exit
code and an explanatory ``stderr`` so the orchestrator can still record evidence.
"""

from __future__ import annotations

import logging
import re
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger("app.orchestrator.sandbox")

# Only run explicitly-fenced python blocks (```python / ```py).
_CODE_RE = re.compile(r"```(?:python|py)\s*\n(.*?)```", re.DOTALL | re.IGNORECASE)


def extract_python_code(text: str) -> str | None:
    """Return the first fenced ```python block's body, or ``None``."""
    if not text:
        return None
    m = _CODE_RE.search(text)
    return m.group(1).strip() if m else None


async def run_code(
    code: str,
    *,
    language: str = "python",
    timeout_seconds: float | None = None,
    stdin: str = "",
) -> dict[str, Any]:
    settings = get_settings()
    url = settings.sandbox_url.rstrip("/") + "/run"
    timeout = timeout_seconds or settings.sandbox_timeout_seconds
    payload = {
        "code": code,
        "language": language,
        "timeout_seconds": timeout,
        "stdin": stdin or "",
    }
    try:
        async with httpx.AsyncClient(timeout=float(timeout) + 5.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            data.setdefault("language", language)
            return data
    except Exception as exc:  # noqa: BLE001 - degrade gracefully, never crash a run
        logger.warning("sandbox call failed: %s", exc)
        return {
            "stdout": "",
            "stderr": f"[sandbox unavailable] {exc}",
            "exit_code": -1,
            "duration_ms": 0,
            "timed_out": False,
            "language": language,
        }
