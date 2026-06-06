"""Marketplace schemas (v2: immutable versions, fork_mode, social counters).

A listing carries a monotonically increasing ``version`` and an immutable
``snapshot`` of the published content; each publish appends a
:class:`MarketplaceVersion`. ``fork_mode`` controls whether forks are
``editable`` or ``locked`` (config hidden + non-editable, mirroring Xyzen).
Social signals: ``likes / forks / views`` (``downloads`` kept as a back-compat
alias of ``forks``).

Back-compat: new fields are optional with defaults so v1 rows validate until the
backend-features workstream migrates the model.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.agent import Agent
from app.schemas.skill import Skill


class MarketplaceItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    ref_id: uuid.UUID
    owner_id: uuid.UUID
    title: str
    description: str | None = None
    price_points: int
    # --- v2 ---
    version: int = 1
    # editable | locked
    fork_mode: str = "editable"
    likes: int = 0
    forks: int = 0
    views: int = 0
    # Back-compat alias of ``forks``.
    downloads: int = 0
    # Immutable snapshot of the latest published version's content.
    snapshot: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime | None = None


class MarketplaceVersion(BaseModel):
    """An immutable published snapshot of a listing at a point in time."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    item_id: uuid.UUID
    version: int
    snapshot: dict[str, Any] = Field(default_factory=dict)
    changelog: str | None = None
    created_at: datetime


class MarketplaceCreate(BaseModel):
    kind: str
    ref_id: uuid.UUID
    title: str
    description: str | None = None
    price_points: int = 0
    # editable | locked
    fork_mode: str = "editable"


class MarketplacePublishRequest(BaseModel):
    """Publish a new immutable version from the current source (agent/skill)."""

    changelog: str | None = None


class MarketplaceForkResponse(BaseModel):
    """Response for ``POST /api/marketplace/{id}/fork``."""

    item: MarketplaceItem
    agent: Agent | None = None
    skill: Skill | None = None
    # Version the fork was taken from (lineage sync; mirrors Agent.source_version).
    source_version: int | None = None


class MarketplaceLikeResponse(BaseModel):
    """Response for ``POST /api/marketplace/{id}/like`` (toggle)."""

    item_id: uuid.UUID
    likes: int
    liked: bool


class PointsResponse(BaseModel):
    """Response for ``GET /api/marketplace/points``."""

    user_id: uuid.UUID
    points: int
