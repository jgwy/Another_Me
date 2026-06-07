"""Scenario model — a stage agents are dispatched into.

A scenario may be a built-in **system** stage (``owner_id == null``, seeded) or a
**user-created** one (``owner_id`` set). ``is_public`` controls listing visibility
(system seeds default public). ``meta`` is a free-form JSONB blob that carries the
map / visual / plaza data the 2.5D world renders from. Documented shape::

    {
      "building": "exchange",          # sprite / building key for the world map
      "x": 26, "y": 32,                # map coordinates on the 0..100 island grid
      "category": "business",          # taxonomy bucket (business|social|health|art|…)
      "report_dialect": "商业评估…",    # how the post-encounter report reads
      "visual": {                      # optional building/plaza visuals
        "sprite": "string?", "palette": "string?", "icon": "string?"
      },
      "plaza": {                       # optional 2.5D plaza layout (presence/广场)
        "width": 0, "height": 0,
        "spawn": [{"x": 0, "y": 0}],   # spawn points for arriving 小人
        "props": []                    # decorative props
      }
    }

All keys are optional; the renderer falls back to defaults when absent.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Text, Uuid, func, text
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
    # owner_id == null ⇒ a built-in/system scenario; otherwise user-created.
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # Listing visibility. System seeds default public; user scenarios opt in.
    is_public: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true"), index=True
    )
    # Map / visual / plaza blob (see module docstring for the documented shape).
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
