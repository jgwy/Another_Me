"""Evolution endpoints: list per agent, apply/rollback a diff onto the agent."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import CurrentUser, SessionDep
from app.models import Agent, Evolution, Skill
from app.schemas import Evolution as EvolutionSchema
from app.schemas import EvolutionApply

router = APIRouter(prefix="/evolutions", tags=["evolutions"])


@router.get("", response_model=list[EvolutionSchema])
async def list_evolutions(
    current_user: CurrentUser,
    session: SessionDep,
    agent_id: uuid.UUID | None = Query(None, description="Required; 400 if missing"),
) -> list[Evolution]:
    if agent_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="agent_id is required")
    agent = await session.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="agent not found")
    if agent.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not the owner")
    rows = (
        await session.scalars(
            select(Evolution)
            .where(Evolution.agent_id == agent_id)
            .order_by(Evolution.created_at.desc())
        )
    ).all()
    return list(rows)


async def _apply_diff(session, agent: Agent, diff: dict) -> None:
    persona = diff.get("persona") or {}
    if persona.get("after") is not None:
        agent.persona = persona["after"]
    rules = diff.get("rules") or {}
    if isinstance(rules.get("after"), dict):
        agent.rules = rules["after"]
    existing = {s.name for s in (await _agent_skills(session, agent.id))}
    for s in diff.get("skills_added") or []:
        name = s.get("name") if isinstance(s, dict) else None
        if name and name not in existing:
            session.add(
                Skill(
                    agent_id=agent.id,
                    owner_id=agent.owner_id,
                    name=name,
                    content=s.get("content", "") if isinstance(s, dict) else "",
                    source="evolved",
                )
            )


async def _rollback_diff(session, agent: Agent, diff: dict) -> None:
    persona = diff.get("persona") or {}
    if persona.get("before") is not None:
        agent.persona = persona["before"]
    rules = diff.get("rules") or {}
    if isinstance(rules.get("before"), dict):
        agent.rules = rules["before"]
    added_names = {
        s.get("name") for s in (diff.get("skills_added") or []) if isinstance(s, dict) and s.get("name")
    }
    if added_names:
        for skill in await _agent_skills(session, agent.id):
            if skill.source == "evolved" and skill.name in added_names:
                await session.delete(skill)


async def _agent_skills(session, agent_id: uuid.UUID) -> list[Skill]:
    rows = await session.scalars(select(Skill).where(Skill.agent_id == agent_id))
    return list(rows)


@router.post("/{evolution_id}/apply", response_model=EvolutionSchema)
async def apply_evolution(
    evolution_id: uuid.UUID,
    current_user: CurrentUser,
    session: SessionDep,
    body: EvolutionApply | None = None,
) -> Evolution:
    evolution = await session.get(Evolution, evolution_id)
    if evolution is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="evolution not found")
    agent = await session.get(Agent, evolution.agent_id)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="agent not found")
    if agent.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not the owner")

    want_applied = body.applied if body is not None else True
    diff = evolution.diff or {}

    if want_applied and not evolution.applied:
        await _apply_diff(session, agent, diff)
        evolution.applied = True
        evolution.applied_at = datetime.now(timezone.utc)
    elif not want_applied and evolution.applied:
        await _rollback_diff(session, agent, diff)
        evolution.applied = False
        evolution.applied_at = None

    await session.commit()
    await session.refresh(evolution)
    return evolution
