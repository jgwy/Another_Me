"""Marketplace endpoints: list, publish, points balance, fork (clone), and v2
versioning + social signals (likes / immutable versions / views).

Points are a simulated economy: registration grants 100 (model default); forking a
priced listing debits the forker and credits the lister. Each listing carries a
monotonically increasing ``version`` and an immutable, credential-stripped
``snapshot``; ``forks`` is the canonical fork counter (``downloads`` mirrors it).
"""

from __future__ import annotations

import copy
import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select

from app.api.deps import CurrentUser, OptionalUser, SessionDep
from app.models import (
    Agent,
    MarketplaceItem,
    MarketplaceLike,
    MarketplaceVersion,
    Skill,
    User,
)
from app.schemas import Agent as AgentSchema
from app.schemas import (
    MarketplaceCreate,
    MarketplaceForkResponse,
    MarketplaceLikeResponse,
    MarketplacePublishRequest,
    Page,
    PointsResponse,
)
from app.schemas import MarketplaceItem as MarketplaceItemSchema
from app.schemas import MarketplaceVersion as MarketplaceVersionSchema
from app.schemas import Skill as SkillSchema
from app.services.agents import clone_agent, get_agent_with_skills
from app.services.marketplace import build_snapshot

router = APIRouter(prefix="/marketplace", tags=["marketplace"])

_VALID_KINDS = {"agent", "skill"}
_VALID_FORK_MODES = {"editable", "locked"}


@router.get("", response_model=Page[MarketplaceItemSchema])
async def list_marketplace(
    session: SessionDep,
    kind: str | None = Query(None, description="'agent' or 'skill'"),
    q: str | None = Query(None),
    sort: str | None = Query(None, description="'downloads' | 'recent' | 'likes'"),
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

    if sort == "downloads":
        order = MarketplaceItem.downloads.desc()
    elif sort == "likes":
        order = MarketplaceItem.likes.desc()
    else:
        order = MarketplaceItem.created_at.desc()

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
    if body.fork_mode not in _VALID_FORK_MODES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid fork_mode")

    if body.kind == "agent":
        # Eager-load skills so the snapshot builder can read them async-safely.
        ref = await get_agent_with_skills(session, body.ref_id)
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
        fork_mode=body.fork_mode,
        version=1,
        snapshot=build_snapshot(body.kind, ref),
    )
    session.add(item)
    await session.flush()
    # Seed the immutable version history with v1.
    session.add(
        MarketplaceVersion(
            item_id=item.id,
            version=1,
            snapshot=item.snapshot,
            changelog="initial",
        )
    )
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
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="referenced agent no longer exists"
            )
        # source_version records the listing version this fork was taken from.
        # A 'locked' fork's lineage is captured by item.fork_mode + this
        # source_version (the frontend hides editing for locked forks); no extra
        # backend field is needed.
        agent_out = await clone_agent(
            session,
            source,
            current_user.id,
            name=f"{source.name} (fork)",
            source_version=item.version,
        )
    elif item.kind == "skill":
        source_skill = await session.get(Skill, item.ref_id)
        if source_skill is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="referenced skill no longer exists"
            )
        # Skills have no source_version column; lineage is returned in the
        # response only (see fork_mode comment above for locked listings).
        skill_out = Skill(
            agent_id=None,
            owner_id=current_user.id,
            name=source_skill.name,
            description=source_skill.description,
            prompt_body=source_skill.prompt_body or source_skill.content,
            content=source_skill.content,
            params=copy.deepcopy(source_skill.params or []),
            tags=copy.deepcopy(source_skill.tags or []),
            executable=copy.deepcopy(source_skill.executable) if source_skill.executable else None,
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
    # forks is canonical; downloads mirrors it for v1 back-compat.
    item.forks += 1
    item.downloads += 1

    await session.commit()
    await session.refresh(item)

    return MarketplaceForkResponse(
        item=MarketplaceItemSchema.model_validate(item),
        agent=AgentSchema.model_validate(agent_out) if agent_out is not None else None,
        skill=SkillSchema.model_validate(skill_out) if skill_out is not None else None,
        source_version=item.version,
    )


# --- Marketplace v2 (§4): immutable versions + social signals. ---------------- #


@router.post("/{item_id}/like", response_model=MarketplaceLikeResponse)
async def like_listing(
    item_id: uuid.UUID,
    current_user: CurrentUser,
    session: SessionDep,
) -> MarketplaceLikeResponse:
    """Toggle the caller's like on a listing."""
    item = await session.get(MarketplaceItem, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="listing not found")

    existing = await session.scalar(
        select(MarketplaceLike).where(
            MarketplaceLike.item_id == item_id,
            MarketplaceLike.user_id == current_user.id,
        )
    )
    if existing is not None:
        await session.delete(existing)
        item.likes = max(0, item.likes - 1)
        liked = False
    else:
        session.add(MarketplaceLike(item_id=item_id, user_id=current_user.id))
        item.likes += 1
        liked = True

    await session.commit()
    return MarketplaceLikeResponse(item_id=item.id, likes=item.likes, liked=liked)


@router.get("/{item_id}/versions", response_model=list[MarketplaceVersionSchema])
async def list_versions(
    item_id: uuid.UUID,
    current_user: OptionalUser,
    session: SessionDep,
) -> list[MarketplaceVersionSchema]:
    """List a listing's immutable published versions (newest first)."""
    item = await session.get(MarketplaceItem, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="listing not found")

    # Viewing the version history counts as a view of the listing.
    item.views += 1
    await session.commit()

    rows = (
        await session.scalars(
            select(MarketplaceVersion)
            .where(MarketplaceVersion.item_id == item_id)
            .order_by(MarketplaceVersion.version.desc())
        )
    ).all()
    return [MarketplaceVersionSchema.model_validate(v) for v in rows]


@router.post(
    "/{item_id}/publish",
    response_model=MarketplaceItemSchema,
    status_code=status.HTTP_201_CREATED,
)
async def publish_version(
    item_id: uuid.UUID,
    body: MarketplacePublishRequest,
    current_user: CurrentUser,
    session: SessionDep,
) -> MarketplaceItem:
    """Freeze the current source (agent/skill) as a new immutable version."""
    item = await session.get(MarketplaceItem, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="listing not found")
    if item.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not the owner")

    if item.kind == "agent":
        source = await get_agent_with_skills(session, item.ref_id)
    else:
        source = await session.get(Skill, item.ref_id)
    if source is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"referenced {item.kind} no longer exists",
        )

    snap = build_snapshot(item.kind, source)
    new_version = item.version + 1
    session.add(
        MarketplaceVersion(
            item_id=item.id,
            version=new_version,
            snapshot=snap,
            changelog=body.changelog,
        )
    )
    item.version = new_version
    item.snapshot = snap

    await session.commit()
    await session.refresh(item)
    return item
