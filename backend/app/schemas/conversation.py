"""Conversation and participant schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.agent import AgentSummary


class Participant(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    conversation_id: uuid.UUID
    agent_id: uuid.UUID
    seat: int
    role: str | None = None
    agent: AgentSummary


class Conversation(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    scenario_id: uuid.UUID
    status: str
    n_rounds: int
    title: str | None = None
    participants: list[Participant] = Field(default_factory=list)
    created_at: datetime
    started_at: datetime | None = None
    ended_at: datetime | None = None
