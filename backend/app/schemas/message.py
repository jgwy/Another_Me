"""Message schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class Message(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    conversation_id: uuid.UUID
    seq: int
    turn_index: int | None = None
    agent_id: uuid.UUID | None = None
    sender: str
    content: str
    meta: dict | None = None
    created_at: datetime
