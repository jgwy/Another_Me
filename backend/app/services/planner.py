"""Autonomous trip planner (§6).

Given a dispatched twin's profile + a Task prompt, the planner:

1. picks an ordered sequence of **scenes** (2–4) — the LLM chooses from the
   available scenarios (with a robust deterministic fallback), and
2. for each scene, runs **explainable matching** (``services.matching``) to pick
   an opponent, emitting ``reasons`` / ``risks``.

It returns a :class:`PlannedTrip` (a summary + ordered stops). Persisting it as
``Trip.plan`` + ``TripEncounter`` rows is the trip engine's job. The planner runs
inside the engine's session, so the returned ORM objects stay attached.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import llm
from app.core.config import get_settings
from app.models import Agent, Scenario
from app.services.jsonparse import as_str_list, extract_json
from app.services.matching import match_opponent_explained

logger = logging.getLogger("app.services.planner")

_MIN_ENCOUNTERS = 2
_MAX_ENCOUNTERS = 4

_BUSINESS_TAGS = {"投资人", "创业者", "增长", "估值", "SaaS", "fintech", "硬科技", "B2B", "企业服务", "出海", "消费"}

_PLAN_SYSTEM = (
    "你是数字社交世界的“出行规划师”。根据一个数字分身的画像与它这趟想做的事，"
    "为它规划一条 2-4 段的社交动线：从给定的【可选场景】里挑选并排序若干站（可以重复），"
    "让这趟旅程既贴合它的目标又有层次。只输出 JSON（不要解释、不要代码围栏）："
    '{"scenes": [场景key, ...], "summary": "一句话说明这条动线的用意"}'
)


@dataclass
class PlannedStop:
    scenario: Scenario
    opponent: Agent | None
    reasons: list[str] = field(default_factory=list)
    risks: list[str] = field(default_factory=list)


@dataclass
class PlannedTrip:
    summary: str
    stops: list[PlannedStop] = field(default_factory=list)


def _clamp_n(requested: int | None) -> int:
    n = requested if requested else get_settings().trip_max_encounters
    return max(_MIN_ENCOUNTERS, min(_MAX_ENCOUNTERS, n))


async def _load_scenarios(session: AsyncSession) -> tuple[dict[str, Scenario], list[str]]:
    """Return (key→scenario, preferred_keys). Prefer ``is_full`` scenes."""
    rows = list(await session.scalars(select(Scenario)))
    by_key = {s.key: s for s in rows}
    full = [s.key for s in rows if s.is_full]
    preferred = full or [s.key for s in rows]
    return by_key, preferred


def _heuristic_scene_keys(
    agent: Agent, preferred: list[str], n: int, hints: list[str]
) -> list[str]:
    """Bias scene choice by the twin's tags; honor valid hints first."""
    if not preferred:
        return []
    tags = {str(t) for t in (agent.profile_tags or [])}
    business_leaning = bool(tags & _BUSINESS_TAGS)
    primary = "exchange" if business_leaning else "cafe"
    # Order preference: hints (valid) → primary → the rest.
    ordered: list[str] = []
    for h in hints:
        if h in preferred and h not in ordered:
            ordered.append(h)
    if primary in preferred and primary not in ordered:
        ordered.append(primary)
    for k in preferred:
        if k not in ordered:
            ordered.append(k)
    # Build an n-length sequence, alternating to add variety when possible.
    seq: list[str] = []
    i = 0
    while len(seq) < n:
        seq.append(ordered[i % len(ordered)])
        i += 1
    return seq


async def _choose_scene_keys(
    agent: Agent,
    task_prompt: str,
    by_key: dict[str, Scenario],
    preferred: list[str],
    n: int,
    hints: list[str],
) -> tuple[list[str], str]:
    """Ask the LLM to pick a scene sequence; fall back to the heuristic."""
    fallback = _heuristic_scene_keys(agent, preferred, n, hints)
    options = [
        {"key": k, "name": by_key[k].name, "kind": by_key[k].kind} for k in preferred
    ]
    user = (
        f"分身：{agent.name}\n标签：{'、'.join(str(t) for t in (agent.profile_tags or [])) or '（未知）'}\n"
        f"它这趟想做的事：{task_prompt or '随意走走，多认识些人'}\n"
        f"需要 {n} 站。可选场景：{options}\n"
        f"偏好（如有）：{hints}"
    )
    try:
        raw = await llm.complete(
            [{"role": "system", "content": _PLAN_SYSTEM}, {"role": "user", "content": user}],
            meta={
                "mode": "plan",
                "scene_keys": preferred,
                "n": n,
                "agent_tags": [str(t) for t in (agent.profile_tags or [])],
                "task": task_prompt,
            },
            temperature=0.5,
            max_tokens=400,
        )
        parsed = extract_json(raw) or {}
    except Exception as exc:  # noqa: BLE001 - planning must never hard-fail
        logger.warning("scene planning LLM failed (%s) — using heuristic", exc)
        parsed = {}

    keys = [k for k in as_str_list(parsed.get("scenes")) if k in by_key]
    summary = str(parsed.get("summary") or "").strip()
    if not keys:
        keys = fallback
    # Normalize to exactly n stops.
    if len(keys) > n:
        keys = keys[:n]
    while len(keys) < n and (fallback or keys):
        keys.append((fallback or keys)[len(keys) % len(fallback or keys)])
    return keys, summary


def _default_summary(agent: Agent, stops: list[PlannedStop], task_prompt: str) -> str:
    scenes = "、".join(dict.fromkeys(s.scenario.name for s in stops)) or "几个地方"
    who = "、".join(dict.fromkeys(s.opponent.name for s in stops if s.opponent)) or "一些新朋友"
    goal = f"，围绕「{task_prompt.strip()}」" if task_prompt.strip() else ""
    return f"{agent.name} 打算走过{scenes}，去见见{who}{goal}。"


async def plan_trip(
    session: AsyncSession,
    agent: Agent,
    task_prompt: str,
    *,
    max_encounters: int | None = None,
    scenario_hints: list[str] | None = None,
) -> PlannedTrip:
    """Plan an autonomous 2–4 encounter journey for ``agent``."""
    by_key, preferred = await _load_scenarios(session)
    if not preferred:
        return PlannedTrip(summary="", stops=[])

    n = _clamp_n(max_encounters)
    hints = [h for h in (scenario_hints or []) if isinstance(h, str)]
    keys, llm_summary = await _choose_scene_keys(agent, task_prompt, by_key, preferred, n, hints)

    used: set = set()
    stops: list[PlannedStop] = []
    for key in keys:
        scenario = by_key.get(key)
        if scenario is None:
            continue
        opponent, reasons, risks = await match_opponent_explained(
            session, scenario, agent, exclude_ids=used
        )
        if opponent is not None:
            used.add(opponent.id)
        stops.append(PlannedStop(scenario=scenario, opponent=opponent, reasons=reasons, risks=risks))

    # Prefer stops that actually found an opponent; keep at least one stop.
    with_opp = [s for s in stops if s.opponent is not None]
    if with_opp:
        stops = with_opp

    summary = llm_summary or _default_summary(agent, stops, task_prompt)
    return PlannedTrip(summary=summary, stops=stops)
