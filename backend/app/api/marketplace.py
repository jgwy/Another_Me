"""Marketplace endpoints: list, publish, points balance, and fork (clone).

Points are a simulated economy: registration grants 100 (model default); forking a
priced listing debits the forker and credits the lister.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Agent, MarketplaceItem, Skill, User
from app.schemas import Agent as AgentSchema
from app.schemas import (
    MarketplaceCreate,
    MarketplaceForkResponse,
    Page,
    PointsResponse,
)
from app.schemas import MarketplaceItem as MarketplaceItemSchema
from app.schemas import Skill as SkillSchema
from app.services.agents import clone_agent, get_agent_with_skills

router = APIRouter(prefix="/marketplace", tags=["marketplace"])

_VALID_KINDS = {"agent", "skill"}


@router.get("", response_model=Page[MarketplaceItemSchema])
async def list_marketplace(
    session: SessionDep,
    kind: str | None = Query(None, description="'agent' or 'skill'"),
    q: str | None = Query(None),
    sort: str | None = Query(None, description="'downloads' or 'recent'"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> Page[MarketplaceItemSchema]:
    conditions = []
    if kind:
        conditions.append(MarketplaceItem.kind == kind)
    if q:
        like = f"%{q}%"
        conditions.append(
            or_(MarketplaceItem.title.ilike(like), MarketplaceItem.description.ilike(like))
        )

    order = (
        MarketplaceItem.downloads.desc()
        if sort == "downloads"
        else MarketplaceItem.created_at.desc()
    )
    total = await session.scalar(
        select(func.count()).select_from(MarketplaceItem).where(*conditions)
    ) or 0
    rows = (
        await session.scalars(
            select(MarketplaceItem).where(*conditions).order_by(order).limit(limit).offset(offset)
        )
    ).all()
    items = [MarketplaceItemSchema.model_validate(i) for i in rows]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.post("", response_model=MarketplaceItemSchema, status_code=status.HTTP_201_CREATED)
async def create_listing(
    body: MarketplaceCreate,
    current_user: CurrentUser,
    session: SessionDep,
) -> MarketplaceItem:
    if body.kind not in _VALID_KINDS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid kind")

    if body.kind == "agent":
        ref = await session.get(Agent, body.ref_id)
    else:
        ref = await session.get(Skill, body.ref_id)
    if ref is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{body.kind} not found")
    if ref.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not the owner of ref_id")

    item = MarketplaceItem(
        kind=body.kind,
        ref_id=body.ref_id,
        owner_id=current_user.id,
        title=body.title,
        description=body.description,
        price_points=max(0, body.price_points),
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item


@router.get("/points", response_model=PointsResponse)
async def get_points(current_user: CurrentUser, session: SessionDep) -> PointsResponse:
    return PointsResponse(user_id=current_user.id, points=current_user.points)


@router.post(
    "/{item_id}/fork",
    response_model=MarketplaceForkResponse,
    status_code=status.HTTP_201_CREATED,
)
async def fork_listing(
    item_id: uuid.UUID,
    current_user: CurrentUser,
    session: SessionDep,
) -> MarketplaceForkResponse:
    item = await session.get(MarketplaceItem, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="listing not found")

    price = max(0, item.price_points)
    if price > 0 and current_user.points < price:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="not enough points")

    agent_out: Agent | None = None
    skill_out: Skill | None = None

    if item.kind == "agent":
        source = await get_agent_with_skills(session, item.ref_id)
        if source is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="referenced agent no longer exists")
        agent_out = await clone_agent(session, source, current_user.id, name=f"{source.name} (fork)")
    elif item.kind == "skill":
        source_skill = await session.get(Skill, item.ref_id)
        if source_skill is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="referenced skill no longer exists")
        skill_out = Skill(
            agent_id=None,
            owner_id=current_user.id,
            name=source_skill.name,
            content=source_skill.content,
            source="upload",
        )
        session.add(skill_out)
        await session.flush()
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid listing kind")

    # Simulated economy: debit forker, credit lister (if different).
    if price > 0:
        current_user.points -= price
        if item.owner_id != current_user.id:
            owner = await session.get(User, item.owner_id)
            if owner is not None:
                owner.points += price
    item.downloads += 1

    await session.commit()
    await session.refresh(item)

    return MarketplaceForkResponse(
        item=MarketplaceItemSchema.model_validate(item),
        agent=AgentSchema.model_validate(agent_out) if agent_out is not None else None,
        skill=SkillSchema.model_validate(skill_out) if skill_out is not None else None,
    )
