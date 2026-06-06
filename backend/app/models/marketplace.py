"""Marketplace listing model — a published agent or skill."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class MarketplaceItem(Base):
    __tablename__ = "marketplace_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(index=True)
    ref_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column()
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price_points: Mapped[int] = mapped_column(default=0)
    downloads: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
