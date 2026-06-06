"""Tolerant JSON extraction for LLM output.

Real models sometimes wrap JSON in prose or ```json fences. These helpers pull a
JSON object out of arbitrary text and coerce loose fields into the shapes we need.
"""

from __future__ import annotations

import json
import re
from typing import Any

_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


def extract_json(text: str) -> dict[str, Any] | None:
    """Best-effort: return the first JSON object found in ``text`` or ``None``."""
    if not text:
        return None
    text = text.strip()
    # 1. Whole string is JSON.
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            return obj
    except (ValueError, TypeError):
        pass
    # 2. Fenced ```json block.
    m = _FENCE_RE.search(text)
    if m:
        try:
            obj = json.loads(m.group(1))
            if isinstance(obj, dict):
                return obj
        except (ValueError, TypeError):
            pass
    # 3. First balanced {...} span.
    start = text.find("{")
    while start != -1:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    candidate = text[start : i + 1]
                    try:
                        obj = json.loads(candidate)
                        if isinstance(obj, dict):
                            return obj
                    except (ValueError, TypeError):
                        break
        start = text.find("{", start + 1)
    return None


def as_str_list(value: Any) -> list[str]:
    """Coerce a value into a list of non-empty strings."""
    if value is None:
        return []
    if isinstance(value, str):
        parts = re.split(r"[,，;；\n]", value)
        return [p.strip() for p in parts if p.strip()]
    if isinstance(value, (list, tuple)):
        return [str(v).strip() for v in value if str(v).strip()]
    return [str(value).strip()]
