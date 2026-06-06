"""Agent model — a user's AI twin."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.skill import Skill
    from app.models.user import User


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column()
    persona: Mapped[str] = mapped_column(Text, default="")
    rules: Mapped[dict] = mapped_column(JSONB, default=dict)
    # Structured social-twin "brain" (see app.schemas.prompt_config.PromptConfig):
    # identity / voice / values / interests / memory_hooks / security. Empty {} for
    # legacy agents → the prompt builder falls back to persona/rules/profile_tags.
    prompt_config: Mapped[dict] = mapped_column(JSONB, default=dict)
    profile_tags: Mapped[list] = mapped_column(JSONB, default=list)
    questionnaire: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    avatar: Mapped[str | None] = mapped_column(nullable=True)
    max_rounds: Mapped[int] = mapped_column(default=8)
    is_public: Mapped[bool] = mapped_column(default=False)
    forked_from: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("agents.id", ondelete="SET NULL"), nullable=True
    )
    # Marketplace v2: the listing version this agent was forked from (lineage sync).
    source_version: Mapped[int | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    owner: Mapped["User"] = relationship(foreign_keys=[owner_id])
    skills: Mapped[list["Skill"]] = relationship(
        back_populates="agent", cascade="all, delete-orphan"
    )
