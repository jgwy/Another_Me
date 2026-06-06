"""LLM-assisted synthesis of an agent persona from a questionnaire.

Returns a normalized dict ``{persona, rules, profile_tags, skills}``. Works with
any provider (including the deterministic ``mock``); if the model output can't be
parsed, a sensible fallback is derived directly from the questionnaire so agent
creation never fails.
"""

from __future__ import annotations

import json
from typing import Any

from app import llm
from app.services.jsonparse import as_str_list, extract_json

_SYSTEM = (
    "你是一个数字分身的角色设定生成器。根据用户填写的结构化问卷，为其数字分身生成："
    "persona（一段第一人称之外的角色描述）、行为规则 rules、画像标签 profile_tags、初始技能 skills。"
    "只输出一个 JSON 对象，不要任何解释，结构为："
    '{"persona": string, "rules": {"tone": string, "dos": [string], "donts": [string]}, '
    '"profile_tags": [string], "skills": [{"name": string, "content": string}]}'
)


def _fallback(name: str, questionnaire: dict[str, Any]) -> dict[str, Any]:
    domain = str(questionnaire.get("domain") or questionnaire.get("领域") or "综合").strip()
    goals = str(questionnaire.get("goals") or questionnaire.get("目标") or "去探索更广阔的世界").strip()
    tags: list[str] = []
    for key in ("domain", "领域", "personality", "性格", "interests", "兴趣", "tags", "标签"):
        tags.extend(as_str_list(questionnaire.get(key)))
    seen: list[str] = []
    for t in tags:
        if t not in seen:
            seen.append(t)
    return {
        "persona": f"{name} 是一位关注「{domain}」的数字分身，目标是{goals}。",
        "rules": {
            "tone": "真诚而专业",
            "dos": ["紧扣场景话题", "用具体例子支撑观点"],
            "donts": ["空谈套话", "偏离主人设定的目标"],
        },
        "profile_tags": seen[:6] or [domain],
        "skills": [],
    }


def _normalize(raw: dict[str, Any], name: str, questionnaire: dict[str, Any]) -> dict[str, Any]:
    fb = _fallback(name, questionnaire)
    persona = str(raw.get("persona") or fb["persona"]).strip()

    rules_in = raw.get("rules") or {}
    if not isinstance(rules_in, dict):
        rules_in = {}
    rules = {
        "tone": str(rules_in.get("tone") or fb["rules"]["tone"]).strip(),
        "dos": as_str_list(rules_in.get("dos")) or fb["rules"]["dos"],
        "donts": as_str_list(rules_in.get("donts")) or fb["rules"]["donts"],
    }

    tags = as_str_list(raw.get("profile_tags")) or fb["profile_tags"]
    deduped: list[str] = []
    for t in tags:
        if t not in deduped:
            deduped.append(t)

    skills_out: list[dict[str, str]] = []
    for s in raw.get("skills") or []:
        if isinstance(s, dict) and s.get("name"):
            skills_out.append(
                {"name": str(s["name"]).strip(), "content": str(s.get("content", "")).strip()}
            )
        elif isinstance(s, str) and s.strip():
            skills_out.append({"name": s.strip(), "content": ""})

    return {
        "persona": persona,
        "rules": rules,
        "profile_tags": deduped[:8],
        "skills": skills_out,
    }


async def synthesize_agent(name: str, questionnaire: dict[str, Any]) -> dict[str, Any]:
    """Synthesize persona/rules/tags/skills for ``name`` from ``questionnaire``."""
    questionnaire = questionnaire or {}
    user = f"分身名称：{name}\n问卷：{json.dumps(questionnaire, ensure_ascii=False)}"
    try:
        raw = await llm.complete(
            [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": user}],
            meta={"mode": "persona", "name": name, "questionnaire": questionnaire},
            temperature=0.6,
            max_tokens=900,
        )
    except Exception:  # pragma: no cover - network/provider failure → fallback
        return _fallback(name, questionnaire)
    parsed = extract_json(raw)
    if not parsed:
        return _fallback(name, questionnaire)
    return _normalize(parsed, name, questionnaire)
