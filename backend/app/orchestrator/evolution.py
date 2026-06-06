"""Post-conversation agent evolution: a reviewable persona/skills diff.

Created with ``applied=False``; the owner applies or rolls it back via the
evolutions API. The diff carries before/after snapshots so rollback is exact.
"""

from __future__ import annotations

import copy

from app import llm
from app.models import Agent, Conversation, Evolution, Scenario
from app.services.jsonparse import extract_json

_SYSTEM = (
    "你是一个角色成长教练。根据这位数字分身在一场对话中的表现，提出对其 persona 与技能的『增量进化』。"
    "保持原有设定的连续性，只做小幅强化。只输出 JSON："
    "{\"persona_after\": string, \"skills_added\": [{\"name\": string, \"content\": string}], "
    "\"rules_patch\": {\"dos\": [string]}, \"summary\": string}"
)


def _merge_rules(before: dict, patch: dict) -> dict:
    after = copy.deepcopy(before) if before else {}
    for key, value in (patch or {}).items():
        if isinstance(value, list):
            existing = list(after.get(key) or [])
            for item in value:
                if item not in existing:
                    existing.append(item)
            after[key] = existing
        else:
            after[key] = value
    return after


async def generate_evolution(
    session,
    agent: Agent,
    conversation: Conversation,
    scenario: Scenario,
) -> Evolution:
    user = (
        f"分身：{agent.name}\n当前 persona：{agent.persona}\n"
        f"刚刚经历的场景：{scenario.name}（{scenario.kind}）。请给出这次成长的进化建议。"
    )
    raw = await llm.complete(
        [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": user}],
        meta={
            "mode": "evolution",
            "agent_name": agent.name,
            "scenario_name": scenario.name,
            "scenario_kind": scenario.kind,
            "persona_before": agent.persona,
        },
        temperature=0.6,
        max_tokens=700,
    )
    parsed = extract_json(raw) or {}

    persona_before = agent.persona
    persona_after = str(parsed.get("persona_after") or persona_before).strip() or persona_before

    skills_added = []
    for s in parsed.get("skills_added") or []:
        if isinstance(s, dict) and s.get("name"):
            skills_added.append({"name": str(s["name"]).strip(), "content": str(s.get("content", "")).strip()})

    rules_before = copy.deepcopy(agent.rules) if agent.rules else {}
    rules_after = _merge_rules(rules_before, parsed.get("rules_patch") or {})

    diff = {
        "persona": {"before": persona_before, "after": persona_after},
        "skills_added": skills_added,
        "rules": {"before": rules_before, "after": rules_after},
        "summary": str(parsed.get("summary") or "在这场对话中获得了成长。"),
    }
    evolution = Evolution(agent_id=agent.id, conversation_id=conversation.id, diff=diff, applied=False)
    session.add(evolution)
    await session.flush()
    return evolution
