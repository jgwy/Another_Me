"""Report schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class Report(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    conversation_id: uuid.UUID
    kind: str
    summary: str
    content: dict = Field(default_factory=dict)
    created_at: datetime
