"""Opponent matching by profile/tags for a dispatch / autonomous trip.

Deterministic heuristic scoring:
* business (exchange) → strongly prefer investor-tagged opponents;
* empathy (cafe)      → prefer a *different* background (cross-industry empathy);
* generic             → any relevant public agent.

The autonomous trip planner uses :func:`match_opponent_explained`, which returns
the same pick plus human-readable ``reasons`` / ``risks`` (with light Chinese
tokenization for shared-interest detection) so the journey is explainable.
"""

from __future__ import annotations

import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Agent, Scenario

_BUSINESS_TAGS = {"增长", "估值", "SaaS", "消费", "硬科技", "fintech", "数据驱动", "企业服务", "B2B", "出海"}
_INVESTOR_TAG = "投资人"
_FOUNDER_TAG = "创业者"

# --- Light Chinese tokenization (no external segmenter) --------------------- #
_ASCII_WORD = re.compile(r"[a-zA-Z][a-zA-Z0-9+]+")
_CJK_RUN = re.compile(r"[\u4e00-\u9fff]+")


def zh_tokens(text: str) -> set[str]:
    """Tokenize mixed CN/EN text into a bag of comparable tokens.

    ASCII words are lowercased; CJK runs are expanded into character bigrams
    (plus single chars for length-1 runs). Bigrams approximate word overlap well
    enough to surface shared interests without a heavyweight segmenter.
    """
    tokens: set[str] = set()
    if not text:
        return tokens
    for w in _ASCII_WORD.findall(text):
        tokens.add(w.lower())
    for run in _CJK_RUN.findall(text):
        if len(run) == 1:
            tokens.add(run)
            continue
        for i in range(len(run) - 1):
            tokens.add(run[i : i + 2])
    return tokens


def _profile_text(agent: Agent) -> str:
    """Concatenate an agent's profile signals for tokenized overlap."""
    parts = [agent.persona or "", " ".join(str(t) for t in (agent.profile_tags or []))]
    cfg = getattr(agent, "prompt_config", None) or {}
    if isinstance(cfg, dict):
        idn = cfg.get("identity") or {}
        interests = cfg.get("interests") or {}
        parts.append(str(idn.get("one_liner") or ""))
        for key in ("expertise", "passions", "curiosities"):
            parts.append(" ".join(str(x) for x in (interests.get(key) or [])))
    return " ".join(p for p in parts if p)


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


async def list_candidates(
    session: AsyncSession,
    agent: Agent,
    *,
    different_owner: bool,
    exclude_ids: set[uuid.UUID] | frozenset[uuid.UUID] = frozenset(),
) -> list[Agent]:
    """Public agents eligible as opponents for ``agent`` (skills eager-loaded)."""
    conditions = [Agent.is_public.is_(True), Agent.id != agent.id]
    if exclude_ids:
        conditions.append(Agent.id.notin_(list(exclude_ids)))
    if different_owner:
        conditions.append(Agent.owner_id != agent.owner_id)
    rows = await session.scalars(
        select(Agent).where(*conditions).options(selectinload(Agent.skills))
    )
    return list(rows)


def explain_match(scenario: Scenario, agent: Agent, candidate: Agent) -> tuple[list[str], list[str]]:
    """Human-readable reasons + risks for pairing ``agent`` with ``candidate``."""
    agent_tags = {str(t) for t in (agent.profile_tags or [])}
    cand_tags = {str(t) for t in (candidate.profile_tags or [])}
    shared_tags = sorted(agent_tags & cand_tags)
    reasons: list[str] = []
    risks: list[str] = []

    if scenario.kind == "business":
        if _INVESTOR_TAG in cand_tags and _FOUNDER_TAG in agent_tags:
            reasons.append(f"{candidate.name} 是投资人，正好接住你的路演并做尽调追问")
        elif _INVESTOR_TAG in cand_tags:
            reasons.append(f"{candidate.name} 有投资人视角，能犀利地压测你的商业逻辑")
        elif _FOUNDER_TAG in cand_tags:
            reasons.append(f"{candidate.name} 也是创业者，可以互相拆解彼此的增长与单位经济")
        biz_overlap = sorted(cand_tags & _BUSINESS_TAGS)
        if biz_overlap:
            reasons.append("你们都懂「" + "、".join(biz_overlap[:3]) + "」这套商业语言")
        risks.append("交易所节奏偏硬核，数据要扎实，否则容易被问住")
    elif scenario.kind == "empathy":
        only_a = sorted(agent_tags - cand_tags)
        only_c = sorted(cand_tags - agent_tags)
        if only_a and only_c:
            reasons.append(
                f"你们来自不同的世界（{only_a[0]} × {only_c[0]}），适合在咖啡馆互相看见"
            )
        else:
            reasons.append(f"{candidate.name} 愿意慢下来聊聊生活，适合一次轻松的相遇")
        if len(shared_tags) >= 3:
            risks.append("背景太相似，注意别只停留在共识、少了新鲜视角")
    else:
        reasons.append(f"{candidate.name} 与你的话题有交集，适合先聊起来")

    if shared_tags:
        reasons.append("共同关注：" + "、".join(shared_tags[:3]))
    else:
        # Tokenized fallback: do they share *any* topical ground?
        overlap = zh_tokens(_profile_text(agent)) & zh_tokens(_profile_text(candidate))
        if not overlap:
            risks.append("你们几乎没有明显交集，开场可能需要主动破冰")

    # Dedup while preserving order, keep it tight.
    def _dedup(xs: list[str]) -> list[str]:
        seen: list[str] = []
        for x in xs:
            if x and x not in seen:
                seen.append(x)
        return seen

    return _dedup(reasons)[:3], _dedup(risks)[:2]


async def match_opponent_explained(
    session: AsyncSession,
    scenario: Scenario,
    agent: Agent,
    *,
    exclude_ids: set[uuid.UUID] | frozenset[uuid.UUID] = frozenset(),
) -> tuple[Agent | None, list[str], list[str]]:
    """Pick the best opponent for ``agent`` in ``scenario`` with explanations.

    ``exclude_ids`` lets the trip planner avoid repeating opponents across stops.
    """
    candidates = await list_candidates(
        session, agent, different_owner=True, exclude_ids=exclude_ids
    ) or await list_candidates(session, agent, different_owner=False, exclude_ids=exclude_ids)
    if not candidates:
        return None, [], []
    candidates.sort(
        key=lambda c: (score_candidate(scenario, agent, c), c.name, str(c.id)), reverse=True
    )
    best = candidates[0]
    reasons, risks = explain_match(scenario, agent, best)
    return best, reasons, risks


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
