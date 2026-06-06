"""Relationship-graph endpoints (§8).

A directed edge ``from_agent → to_agent`` carries an accumulating ``strength``,
a ``type`` and a human-readable ``label``; across trips these accumulate into a
densifying social network — a core asset of the product.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, SessionDep
from app.models import Relationship as RelationshipModel
from app.schemas import (
    AgentSummary,
    Page,
    Relationship,
    RelationshipGraph,
    RelationshipNode,
)

router = APIRouter(prefix="/relationships", tags=["relationships"])


@router.get("", response_model=Page[Relationship])
async def list_relationships(
    current_user: CurrentUser,
    session: SessionDep,
    agent_id: uuid.UUID | None = Query(None, description="Filter edges touching this agent"),
    type: str | None = Query(None, description="Filter by relationship type"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> Page[Relationship]:
    conditions = [RelationshipModel.owner_id == current_user.id]
    if agent_id is not None:
        conditions.append(
            or_(
                RelationshipModel.from_agent_id == agent_id,
                RelationshipModel.to_agent_id == agent_id,
            )
        )
    if type is not None:
        conditions.append(RelationshipModel.type == type)

    total = await session.scalar(
        select(func.count()).select_from(RelationshipModel).where(*conditions)
    ) or 0
    rows = (
        await session.scalars(
            select(RelationshipModel)
            .where(*conditions)
            .options(
                selectinload(RelationshipModel.from_agent),
                selectinload(RelationshipModel.to_agent),
            )
            .order_by(RelationshipModel.updated_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    items = [Relationship.model_validate(r) for r in rows]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/graph", response_model=RelationshipGraph)
async def relationship_graph(
    current_user: CurrentUser,
    session: SessionDep,
    agent_id: uuid.UUID | None = Query(None, description="Optional focus agent"),
) -> RelationshipGraph:
    conditions = [RelationshipModel.owner_id == current_user.id]
    if agent_id is not None:
        conditions.append(
            or_(
                RelationshipModel.from_agent_id == agent_id,
                RelationshipModel.to_agent_id == agent_id,
            )
        )

    rows = (
        await session.scalars(
            select(RelationshipModel)
            .where(*conditions)
            .options(
                selectinload(RelationshipModel.from_agent),
                selectinload(RelationshipModel.to_agent),
            )
            .order_by(RelationshipModel.updated_at.desc())
        )
    ).all()

    edges = [Relationship.model_validate(r) for r in rows]
    nodes_by_id: dict[uuid.UUID, RelationshipNode] = {}
    for r in rows:
        for agent in (r.from_agent, r.to_agent):
            if agent is not None and agent.id not in nodes_by_id:
                nodes_by_id[agent.id] = RelationshipNode(
                    agent=AgentSummary.model_validate(agent),
                    owned=agent.owner_id == current_user.id,
                )
    return RelationshipGraph(nodes=list(nodes_by_id.values()), edges=edges)
