"""Relationship-graph schemas (§8).

Every encounter updates a directed tie ``from_agent → to_agent`` with a
``strength``, a ``type`` and a human-readable ``label``. Across trips this
accumulates into a densifying social network — a core asset of the product.

Locked contract; the relationship-graph workstream implements the bodies + adds
the ``relationships`` model & migration.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.agent import AgentSummary


class Relationship(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    # Whose graph this edge belongs to (owner of from_agent).
    owner_id: uuid.UUID
    from_agent_id: uuid.UUID
    to_agent_id: uuid.UUID
    # Accumulating tie strength, 0..1.
    strength: float = 0.0
    # ally | mentor | rival | friend | acquaintance | collaborator | ...
    type: str = "acquaintance"
    label: str | None = None
    encounters_count: int = 0
    last_conversation_id: uuid.UUID | None = None
    from_agent: AgentSummary | None = None
    to_agent: AgentSummary | None = None
    created_at: datetime
    updated_at: datetime


class RelationshipNode(BaseModel):
    """A node in the relationship graph view."""

    agent: AgentSummary
    owned: bool = False


class RelationshipGraph(BaseModel):
    """Response for ``GET /api/relationships/graph``."""

    nodes: list[RelationshipNode] = Field(default_factory=list)
    edges: list[Relationship] = Field(default_factory=list)
