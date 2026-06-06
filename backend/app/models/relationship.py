"""Relationship model (§8) — a directed social tie, updated after each encounter.

A directed edge ``from_agent → to_agent`` carries an accumulating ``strength``
(0..1), a ``type`` and a human-readable ``label``. The edge belongs to the owner
of ``from_agent``; across trips these accumulate into a densifying social network.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.agent import Agent


class Relationship(Base):
    __tablename__ = "relationships"
    __table_args__ = (
        UniqueConstraint(
            "owner_id", "from_agent_id", "to_agent_id", name="uq_relationship_owner_from_to"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # Whose graph this edge belongs to (owner of from_agent).
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_agent_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    to_agent_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    strength: Mapped[float] = mapped_column(Float, default=0.0, server_default=text("0"))
    # ally | mentor | rival | friend | acquaintance | collaborator | ...
    type: Mapped[str] = mapped_column(default="acquaintance")
    label: Mapped[str | None] = mapped_column(nullable=True)
    encounters_count: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    last_conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    from_agent: Mapped["Agent"] = relationship(foreign_keys=[from_agent_id])
    to_agent: Mapped["Agent"] = relationship(foreign_keys=[to_agent_id])
