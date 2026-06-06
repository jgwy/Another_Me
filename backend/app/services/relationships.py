"""Relationship-graph write helpers (§8).

After each encounter the trip orchestrator upserts a directed tie
``from_agent → to_agent`` owned by the trip's creator, accumulating ``strength``
and bumping ``encounters_count``. Across trips this densifies into the user's
social network. The caller owns the transaction (this only ``add`` + ``flush``).
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Relationship, Scenario

# Each encounter adds this much tie strength (clamped to 1.0).
_STRENGTH_STEP = 0.18
# Base relationship type by scenario dialect; upgraded to "ally" once close.
_TYPE_BY_KIND = {"business": "collaborator", "empathy": "friend", "generic": "acquaintance"}
_ALLY_THRESHOLD = 0.7


def relationship_type_for(scenario: Scenario | None, strength: float) -> str:
    """Pick a tie ``type`` from the scenario dialect, upgrading when close."""
    if strength >= _ALLY_THRESHOLD:
        return "ally"
    kind = getattr(scenario, "kind", "generic") if scenario is not None else "generic"
    return _TYPE_BY_KIND.get(kind, "acquaintance")


def _label_for(scenario: Scenario | None, count: int) -> str:
    name = getattr(scenario, "name", None) if scenario is not None else None
    where = f"在{name}" if name else "在旅途中"
    if count <= 1:
        return f"{where}初次相遇"
    return f"{where}第 {count} 次同场"


async def upsert_relationship(
    session: AsyncSession,
    *,
    owner_id: uuid.UUID,
    from_agent_id: uuid.UUID,
    to_agent_id: uuid.UUID,
    scenario: Scenario | None = None,
    conversation_id: uuid.UUID | None = None,
    strength_step: float = _STRENGTH_STEP,
) -> Relationship:
    """Create or strengthen the ``from→to`` edge in ``owner_id``'s graph."""
    edge = await session.scalar(
        select(Relationship).where(
            Relationship.owner_id == owner_id,
            Relationship.from_agent_id == from_agent_id,
            Relationship.to_agent_id == to_agent_id,
        )
    )
    if edge is None:
        edge = Relationship(
            owner_id=owner_id,
            from_agent_id=from_agent_id,
            to_agent_id=to_agent_id,
            strength=0.0,
            encounters_count=0,
        )
        session.add(edge)

    edge.encounters_count = (edge.encounters_count or 0) + 1
    edge.strength = round(min(1.0, (edge.strength or 0.0) + strength_step), 4)
    edge.type = relationship_type_for(scenario, edge.strength)
    edge.label = _label_for(scenario, edge.encounters_count)
    if conversation_id is not None:
        edge.last_conversation_id = conversation_id
    await session.flush()
    return edge
