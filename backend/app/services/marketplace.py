"""Marketplace snapshot helpers.

Builds the immutable, credential-stripped content snapshots stored on a
listing's ``snapshot`` field and in each :class:`~app.models.MarketplaceVersion`.
Snapshots never include owner ids / primary keys, and any dict key that looks
like a credential (api key, secret, token, password, credential, authorization)
is dropped recursively before persisting.
"""

from __future__ import annotations

import copy
import re
from typing import Any

from app.models import Agent, Skill

# Case-insensitive match on credential-like dict keys (substring match).
_CREDENTIAL_KEY_RE = re.compile(
    r"(api[_-]?key|secret|token|password|passwd|credential|authorization)", re.IGNORECASE
)


def strip_credentials(obj: Any) -> Any:
    """Recursively copy ``obj``, dropping any dict key that looks like a credential.

    Lists and dicts are rebuilt (so the result is a fresh, independent copy);
    scalar leaves are returned as-is.
    """
    if isinstance(obj, dict):
        return {
            key: strip_credentials(value)
            for key, value in obj.items()
            if not (isinstance(key, str) and _CREDENTIAL_KEY_RE.search(key))
        }
    if isinstance(obj, list):
        return [strip_credentials(value) for value in obj]
    return obj


def build_agent_snapshot(agent: Agent) -> dict[str, Any]:
    """Build a credential-free, id-free snapshot of an agent and its skills.

    Requires ``agent.skills`` to be eagerly loaded by the caller.
    """
    skills = [
        {
            "name": s.name,
            "description": getattr(s, "description", "") or "",
            "prompt_body": getattr(s, "prompt_body", "") or s.content,
            "params": copy.deepcopy(getattr(s, "params", None) or []),
            "tags": copy.deepcopy(getattr(s, "tags", None) or []),
        }
        for s in agent.skills
    ]
    return {
        "kind": "agent",
        "name": agent.name,
        "persona": agent.persona,
        "rules": copy.deepcopy(agent.rules or {}),
        # prompt_config can carry integration config → strip credential keys.
        "prompt_config": strip_credentials(copy.deepcopy(agent.prompt_config or {})),
        "profile_tags": list(agent.profile_tags or []),
        "avatar": agent.avatar,
        "max_rounds": agent.max_rounds,
        "skills": skills,
    }


def build_skill_snapshot(skill: Skill) -> dict[str, Any]:
    """Build a credential-free, id-free snapshot of a standalone/library skill."""
    return {
        "kind": "skill",
        "name": skill.name,
        "description": getattr(skill, "description", "") or "",
        "prompt_body": getattr(skill, "prompt_body", "") or skill.content,
        "params": copy.deepcopy(getattr(skill, "params", None) or []),
        "tags": copy.deepcopy(getattr(skill, "tags", None) or []),
        "executable": strip_credentials(copy.deepcopy(skill.executable or {})),
    }


def build_snapshot(kind: str, ref: Agent | Skill) -> dict[str, Any]:
    """Dispatch to the agent/skill snapshot builder by listing ``kind``."""
    if kind == "agent":
        return build_agent_snapshot(ref)  # type: ignore[arg-type]
    return build_skill_snapshot(ref)  # type: ignore[arg-type]
