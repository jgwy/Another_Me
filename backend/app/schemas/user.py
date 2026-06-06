"""User schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class User(BaseModel):
    """Public user representation. ``password_hash`` is never serialized."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    username: str
    points: int
    created_at: datetime
