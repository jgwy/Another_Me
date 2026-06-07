"""Skill model — a capability attached to an agent (or owned standalone)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Text, Uuid, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.agent import Agent


class Skill(Base):
    """A structured, reusable capability pack (v2).

    ``prompt_body`` is the canonical capability text; ``content`` is the v1
    alias kept mirrored during the migration. ``agent_id == null`` ⇒ a
    standalone/library skill. ``executable`` is a reserved hook (not run yet).
    """

    __tablename__ = "skills"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), nullable=True, index=True
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column()
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    # Canonical capability text; ``content`` mirrors it for v1 back-compat.
    prompt_body: Mapped[str] = mapped_column(Text, default="", server_default="")
    content: Mapped[str] = mapped_column(Text, default="")
    # Raw SKILL.md body (Anthropic-style skill pack). ``prompt_body`` is derived
    # from this on import (frontmatter stripped); kept verbatim for preview/round-trip.
    skill_md: Mapped[str] = mapped_column(Text, default="", server_default="")
    # Parsed SKILL.md frontmatter: {name, description, version, triggers: [...]}.
    manifest: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Packaged resource manifest from the .zip: [{path, kind, ref, size?}, ...].
    resources: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    params: Mapped[list] = mapped_column(JSONB, default=list, server_default=text("'[]'::jsonb"))
    tags: Mapped[list] = mapped_column(JSONB, default=list, server_default=text("'[]'::jsonb"))
    # Reserved execution hook: {"kind": "none|script|mcp", "ref": str?, "config": {}}.
    executable: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    source: Mapped[str] = mapped_column(default="questionnaire")
    is_public: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    agent: Mapped["Agent | None"] = relationship(back_populates="skills")
