"""Dispatch endpoints: create (with matching + auto-start), list, get."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, SessionDep
from app.models import Agent, Dispatch, Scenario
from app.orchestrator import create_conversation, start
from app.schemas import Dispatch as DispatchSchema
from app.schemas import DispatchCreate, Page
from app.services.matching import find_opponent, get_public_or_owned_agent

router = APIRouter(prefix="/dispatches", tags=["dispatches"])


@router.post("", response_model=DispatchSchema, status_code=status.HTTP_201_CREATED)
async def create_dispatch(
    body: DispatchCreate,
    current_user: CurrentUser,
    session: SessionDep,
) -> Dispatch:
    agent = await session.scalar(
        select(Agent).where(Agent.id == body.agent_id).options(selectinload(Agent.skills))
    )
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="agent not found")
    if agent.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not the owner of this agent")

    scenario = await session.get(Scenario, body.scenario_id)
    if scenario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="scenario not found")

    # Resolve an opponent: explicit id wins, else match by profile (also used as the
    # sensible default so a dispatch can actually start a conversation).
    opponent: Agent | None = None
    if body.opponent_agent_id is not None:
        opponent = await get_public_or_owned_agent(session, body.opponent_agent_id, current_user.id)
        if opponent is None:
            target = await session.get(Agent, body.opponent_agent_id)
            if target is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="opponent agent not found")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="opponent agent not accessible")
        if opponent.id == agent.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cannot dispatch against itself")
    else:
        opponent = await find_opponent(session, scenario, agent)

    dispatch = Dispatch(
        agent_id=agent.id,
        scenario_id=scenario.id,
        task_prompt=body.task_prompt,
        opponent_agent_id=opponent.id if opponent else None,
        match_by_profile=body.match_by_profile,
        status="queued",
        created_by=current_user.id,
    )
    session.add(dispatch)
    await session.flush()

    convo_id: uuid.UUID | None = None
    if opponent is not None:
        convo = await create_conversation(session, scenario, agent, opponent)
        dispatch.conversation_id = convo.id
        dispatch.status = "matched"
        convo_id = convo.id

    await session.commit()
    await session.refresh(dispatch)

    if convo_id is not None:
        start(convo_id)

    return dispatch


@router.get("", response_model=Page[DispatchSchema])
async def list_dispatches(
    current_user: CurrentUser,
    session: SessionDep,
    status_filter: str | None = Query(None, alias="status"),
    agent_id: uuid.UUID | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> Page[DispatchSchema]:
    conditions = [Dispatch.created_by == current_user.id]
    if status_filter:
        conditions.append(Dispatch.status == status_filter)
    if agent_id is not None:
        conditions.append(Dispatch.agent_id == agent_id)

    total = await session.scalar(select(func.count()).select_from(Dispatch).where(*conditions)) or 0
    rows = (
        await session.scalars(
            select(Dispatch)
            .where(*conditions)
            .order_by(Dispatch.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    items = [DispatchSchema.model_validate(d) for d in rows]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/{dispatch_id}", response_model=DispatchSchema)
async def get_dispatch(
    dispatch_id: uuid.UUID,
    current_user: CurrentUser,
    session: SessionDep,
) -> Dispatch:
    dispatch = await session.get(Dispatch, dispatch_id)
    if dispatch is None or dispatch.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="dispatch not found")
    return dispatch
