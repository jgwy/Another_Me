"""Notification model (§7) — the user's inbox.

Surfaces what a user's twins brought back (trip/encounter completions, ready
reports, postcards, relationship updates) and drives the unread red-dot.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Text, Uuid, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # trip_completed | encounter_completed | report_ready | postcard
    #   | relationship_update | marketplace | system
    kind: Mapped[str] = mapped_column(default="system")
    title: Mapped[str] = mapped_column()
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    read: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), index=True
    )
    # Deep-link payload: { trip_id?, encounter_id?, conversation_id?, report_id?,
    #   agent_id?, item_id? }.
    data: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
