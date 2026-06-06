"""Agent DB helpers shared by the agents router, dispatch, and marketplace."""

from __future__ import annotations

import copy
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Agent, Skill, User


async def get_agent_with_skills(session: AsyncSession, agent_id: uuid.UUID) -> Agent | None:
    """Load an agent with its ``skills`` eagerly populated for serialization."""
    return await session.scalar(
        select(Agent).where(Agent.id == agent_id).options(selectinload(Agent.skills))
    )


def agent_visible_to(agent: Agent, user: User | None) -> bool:
    """An agent is visible if public or owned by the requesting user."""
    return bool(agent.is_public) or (user is not None and agent.owner_id == user.id)


async def clone_agent(
    session: AsyncSession,
    source: Agent,
    new_owner_id: uuid.UUID,
    *,
    name: str | None = None,
    is_public: bool = False,
) -> Agent:
    """Deep-clone ``source`` (including skills) to a new owner; sets ``forked_from``.

    The caller is responsible for committing. Returns the clone with skills loaded.
    """
    clone = Agent(
        owner_id=new_owner_id,
        name=name or f"{source.name} (fork)",
        persona=source.persona,
        rules=copy.deepcopy(source.rules) if source.rules else {},
        profile_tags=list(source.profile_tags or []),
        questionnaire=copy.deepcopy(source.questionnaire) if source.questionnaire else None,
        avatar=source.avatar,
        max_rounds=source.max_rounds,
        is_public=is_public,
        forked_from=source.id,
    )
    session.add(clone)
    await session.flush()
    for s in source.skills:
        session.add(
            Skill(
                agent_id=clone.id,
                owner_id=new_owner_id,
                name=s.name,
                content=s.content,
                source=s.source,
            )
        )
    await session.flush()
    reloaded = await get_agent_with_skills(session, clone.id)
    assert reloaded is not None
    return reloaded
