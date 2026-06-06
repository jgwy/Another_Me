"""Marketplace schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

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
    downloads: int
    created_at: datetime


class MarketplaceCreate(BaseModel):
    kind: str
    ref_id: uuid.UUID
    title: str
    description: str | None = None
    price_points: int = 0


class MarketplaceForkResponse(BaseModel):
    """Response for ``POST /api/marketplace/{id}/fork``."""

    item: MarketplaceItem
    agent: Agent | None = None
    skill: Skill | None = None


class PointsResponse(BaseModel):
    """Response for ``GET /api/marketplace/points``."""

    user_id: uuid.UUID
    points: int
