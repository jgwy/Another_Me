"""Scenario model — a stage agents are dispatched into."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(unique=True, index=True)
    name: Mapped[str] = mapped_column()
    description: Mapped[str] = mapped_column(Text, default="")
    kind: Mapped[str] = mapped_column(default="generic")
    topics: Mapped[list] = mapped_column(JSONB, default=list)
    scene_prompt: Mapped[str] = mapped_column(Text, default="")
    ending_prompt: Mapped[str] = mapped_column(Text, default="")
    is_full: Mapped[bool] = mapped_column(default=False)
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
