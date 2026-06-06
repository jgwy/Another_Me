"""Opponent matching by profile/tags for a dispatch.

Deterministic heuristic scoring:
* business (exchange) → strongly prefer investor-tagged opponents;
* empathy (cafe)      → prefer a *different* background (cross-industry empathy);
* generic             → any relevant public agent.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Agent, Scenario

_BUSINESS_TAGS = {"增长", "估值", "SaaS", "消费", "硬科技", "fintech", "数据驱动", "企业服务", "B2B", "出海"}
_INVESTOR_TAG = "投资人"
_FOUNDER_TAG = "创业者"


def score_candidate(scenario: Scenario, agent: Agent, candidate: Agent) -> float:
    agent_tags = {str(t) for t in (agent.profile_tags or [])}
    cand_tags = {str(t) for t in (candidate.profile_tags or [])}
    topics = {str(t) for t in (scenario.topics or [])}
    score = 0.0

    if scenario.kind == "business":
        if _INVESTOR_TAG in cand_tags:
            score += 5.0
        if _FOUNDER_TAG in agent_tags and _INVESTOR_TAG in cand_tags:
            score += 3.0
        if _INVESTOR_TAG in agent_tags and _FOUNDER_TAG in cand_tags:
            score += 3.0
        score += len(cand_tags & _BUSINESS_TAGS) * 0.5
    elif scenario.kind == "empathy":
        # Reward difference for cross-industry empathy.
        score += max(0.0, 3.0 - float(len(agent_tags & cand_tags)))
        score += 1.0
    else:
        score += float(len(agent_tags & cand_tags)) * 0.5

    text = (candidate.persona or "") + " " + " ".join(cand_tags)
    for t in topics:
        if t and t in text:
            score += 0.3
    return score


async def find_opponent(
    session: AsyncSession,
    scenario: Scenario,
    agent: Agent,
) -> Agent | None:
    """Pick the best public opponent for ``agent`` in ``scenario`` (or ``None``)."""

    async def _candidates(different_owner: bool) -> list[Agent]:
        conditions = [Agent.is_public.is_(True), Agent.id != agent.id]
        if different_owner:
            conditions.append(Agent.owner_id != agent.owner_id)
        rows = await session.scalars(
            select(Agent).where(*conditions).options(selectinload(Agent.skills))
        )
        return list(rows)

    candidates = await _candidates(different_owner=True) or await _candidates(different_owner=False)
    if not candidates:
        return None

    # Deterministic: highest score, tie-break by name then id.
    def sort_key(c: Agent) -> tuple[float, str, str]:
        return (score_candidate(scenario, agent, c), c.name, str(c.id))

    candidates.sort(key=sort_key, reverse=True)
    return candidates[0]


async def get_public_or_owned_agent(
    session: AsyncSession, agent_id: uuid.UUID, user_id: uuid.UUID
) -> Agent | None:
    agent = await session.scalar(
        select(Agent).where(Agent.id == agent_id).options(selectinload(Agent.skills))
    )
    if agent is None:
        return None
    if agent.is_public or agent.owner_id == user_id:
        return agent
    return None
