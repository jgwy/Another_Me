"""Scenario schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class Scenario(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    key: str
    name: str
    description: str
    kind: str
    topics: list[str] = Field(default_factory=list)
    scene_prompt: str
    ending_prompt: str
    is_full: bool
    # owner_id == null ⇒ built-in/system scenario; otherwise the creating user.
    owner_id: uuid.UUID | None = None
    is_public: bool = True
    # Map / visual / plaza blob (see app.models.scenario for the documented shape).
    meta: dict | None = None
    created_at: datetime


class ScenarioCreate(BaseModel):
    """User-created scenario (``POST /api/scenarios``).

    Contract is final; the scenarios workstream fills the endpoint body (it
    generates ``key``, stamps ``owner_id``, and merges ``category`` into ``meta``).
    """

    name: str
    description: str = ""
    # business | empathy | generic
    kind: str = "generic"
    topics: list[str] = Field(default_factory=list)
    scene_prompt: str = ""
    ending_prompt: str = ""
    # Taxonomy bucket (business|social|health|art|…); stored under ``meta.category``.
    category: str | None = None
    # Optional explicit key; server slugifies ``name`` when omitted.
    key: str | None = None
    is_public: bool = True
    # Optional map/visual/plaza overrides merged into ``meta`` (coords, sprite, …).
    meta: dict | None = None
