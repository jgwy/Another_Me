"""Agent endpoints: create-from-questionnaire, search/list, get, fork, patch."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, OptionalUser, SessionDep
from app.models import Agent, Skill
from app.schemas import Agent as AgentSchema
from app.schemas import AgentCreate, AgentForkRequest, AgentPatch, Page
from app.services.agents import agent_visible_to, clone_agent, get_agent_with_skills
from app.services.synthesis import synthesize_agent

router = APIRouter(prefix="/agents", tags=["agents"])


@router.post("", response_model=AgentSchema, status_code=status.HTTP_201_CREATED)
async def create_agent(body: AgentCreate, current_user: CurrentUser, session: SessionDep) -> Agent:
    synth = await synthesize_agent(body.name, body.questionnaire)
    agent = Agent(
        owner_id=current_user.id,
        name=body.name,
        persona=synth["persona"],
        rules=synth["rules"],
        profile_tags=synth["profile_tags"],
        questionnaire=body.questionnaire or None,
        avatar=body.avatar,
        max_rounds=body.max_rounds,
        is_public=body.is_public,
    )
    session.add(agent)
    await session.flush()

    for s in synth["skills"]:
        session.add(
            Skill(
                agent_id=agent.id,
                owner_id=current_user.id,
                name=s["name"],
                content=s.get("content", ""),
                source="questionnaire",
            )
        )
    for s in body.uploaded_skills:
        session.add(
            Skill(
                agent_id=agent.id,
                owner_id=current_user.id,
                name=s.name,
                content=s.content,
                source=s.source or "upload",
            )
        )

    await session.commit()
    created = await get_agent_with_skills(session, agent.id)
    assert created is not None
    return created


@router.get("", response_model=Page[AgentSchema])
async def list_agents(
    session: SessionDep,
    current_user: OptionalUser,
    q: str | None = Query(None, description="Free text over name/persona/tags"),
    tags: str | None = Query(None, description="Comma-separated, AND-matched"),
    owner: str | None = Query(None, description="'me' or a user uuid"),
    is_public: bool | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> Page[AgentSchema]:
    conditions = []

    # Visibility: public OR owned by the caller.
    visibility = Agent.is_public.is_(True)
    if current_user is not None:
        visibility = or_(visibility, Agent.owner_id == current_user.id)

    if owner == "me":
        if current_user is None:
            return Page(items=[], total=0, limit=limit, offset=offset)
        conditions.append(Agent.owner_id == current_user.id)
    elif owner:
        try:
            owner_uuid = uuid.UUID(owner)
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=400, detail="invalid owner filter") from exc
        conditions.append(Agent.owner_id == owner_uuid)
        conditions.append(visibility)
    else:
        conditions.append(visibility)

    if is_public is not None:
        conditions.append(Agent.is_public.is_(is_public))

    if q:
        like = f"%{q}%"
        conditions.append(
            or_(
                Agent.name.ilike(like),
                Agent.persona.ilike(like),
                cast(Agent.profile_tags, String).ilike(like),
            )
        )

    if tags:
        for tag in [t.strip() for t in tags.split(",") if t.strip()]:
            conditions.append(Agent.profile_tags.contains([tag]))

    total = await session.scalar(select(func.count()).select_from(Agent).where(*conditions)) or 0
    rows = (
        await session.scalars(
            select(Agent)
            .where(*conditions)
            .options(selectinload(Agent.skills))
            .order_by(Agent.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    items = [AgentSchema.model_validate(a) for a in rows]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/{agent_id}", response_model=AgentSchema)
async def get_agent(agent_id: uuid.UUID, session: SessionDep, current_user: OptionalUser) -> Agent:
    agent = await get_agent_with_skills(session, agent_id)
    if agent is None or not agent_visible_to(agent, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="agent not found")
    return agent


@router.post("/{agent_id}/fork", response_model=AgentSchema, status_code=status.HTTP_201_CREATED)
async def fork_agent(
    agent_id: uuid.UUID,
    current_user: CurrentUser,
    session: SessionDep,
    body: AgentForkRequest | None = None,
) -> Agent:
    source = await get_agent_with_skills(session, agent_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="agent not found")
    if not agent_visible_to(source, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not allowed to fork this agent")
    name = body.name if body and body.name else f"{source.name} (fork)"
    clone = await clone_agent(session, source, current_user.id, name=name)
    await session.commit()
    return clone


@router.patch("/{agent_id}", response_model=AgentSchema)
async def patch_agent(
    agent_id: uuid.UUID,
    body: AgentPatch,
    current_user: CurrentUser,
    session: SessionDep,
) -> Agent:
    agent = await get_agent_with_skills(session, agent_id)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="agent not found")
    if agent.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not the owner")

    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(agent, field, value)
    await session.commit()
    refreshed = await get_agent_with_skills(session, agent.id)
    assert refreshed is not None
    return refreshed
