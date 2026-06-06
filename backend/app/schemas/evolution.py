"""Evolution schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class Evolution(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    agent_id: uuid.UUID
    conversation_id: uuid.UUID | None = None
    diff: dict = Field(default_factory=dict)
    applied: bool
    created_at: datetime
    applied_at: datetime | None = None


class EvolutionApply(BaseModel):
    applied: bool = True
