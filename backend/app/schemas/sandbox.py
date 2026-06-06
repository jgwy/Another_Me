"""Sandbox run schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SandboxRun(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    conversation_id: uuid.UUID | None = None
    agent_id: uuid.UUID | None = None
    message_id: uuid.UUID | None = None
    language: str
    code: str
    stdout: str
    stderr: str
    exit_code: int
    duration_ms: int
    created_at: datetime
