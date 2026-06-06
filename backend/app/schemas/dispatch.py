"""Dispatch schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class Dispatch(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    agent_id: uuid.UUID
    scenario_id: uuid.UUID
    task_prompt: str
    opponent_agent_id: uuid.UUID | None = None
    match_by_profile: bool
    status: str
    created_by: uuid.UUID
    conversation_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class DispatchCreate(BaseModel):
    agent_id: uuid.UUID
    scenario_id: uuid.UUID
    task_prompt: str = ""
    opponent_agent_id: uuid.UUID | None = None
    match_by_profile: bool = False
