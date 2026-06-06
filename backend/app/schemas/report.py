"""Report schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class Report(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    # Null only for trip-*summary* reports, which aggregate many conversations.
    # Per-conversation reports always carry it.
    conversation_id: uuid.UUID | None = None
    kind: str
    summary: str
    content: dict = Field(default_factory=dict)
    created_at: datetime
