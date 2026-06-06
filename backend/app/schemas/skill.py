"""Skill schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class Skill(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    agent_id: uuid.UUID | None = None
    owner_id: uuid.UUID
    name: str
    content: str
    source: str
    created_at: datetime


class SkillCreate(BaseModel):
    name: str
    content: str = ""
    source: str = "upload"
