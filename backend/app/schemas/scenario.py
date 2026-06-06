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
    meta: dict | None = None
    created_at: datetime
