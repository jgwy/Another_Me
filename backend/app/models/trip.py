"""Trip models (§6) — an autonomous "travelling-frog" social journey.

One dispatch = one :class:`Trip`: the autonomous planner picks scenes and
(explainably) matches opponents, then the twin travels through **2–4**
:class:`TripEncounter` legs over a configurable real duration. Each encounter
reuses the existing conversation turn protocol; the world map renders the
journey live from ``Trip.status`` / ``Trip.agent_status``.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.agent import Agent


class Trip(Base):
    __tablename__ = "trips"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agent_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    task_prompt: Mapped[str] = mapped_column(Text, default="")
    # planning | traveling | in_encounter | returning | completed | failed | cancelled
    status: Mapped[str] = mapped_column(default="planning", index=True)
    # idle | thinking | departing | traveling | meeting | talking | returning | home
    agent_status: Mapped[str] = mapped_column(default="idle")
    # Autonomous planner output (see app.schemas.trip.TripPlan).
    plan: Mapped[dict] = mapped_column(JSONB, default=dict)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    # Whole-journey report aggregating the per-encounter reports.
    summary_report_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("reports.id", ondelete="SET NULL"), nullable=True
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    agent: Mapped["Agent"] = relationship(foreign_keys=[agent_id])
    encounters: Mapped[list["TripEncounter"]] = relationship(
        back_populates="trip",
        cascade="all, delete-orphan",
        order_by="TripEncounter.seq",
    )


class TripEncounter(Base):
    __tablename__ = "trip_encounters"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    seq: Mapped[int] = mapped_column(Integer, default=0)
    scenario_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("scenarios.id"), nullable=False
    )
    scenario_key: Mapped[str | None] = mapped_column(nullable=True)
    opponent_agent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("agents.id", ondelete="SET NULL"), nullable=True
    )
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True
    )
    # pending | running | completed | failed | skipped
    status: Mapped[str] = mapped_column(default="pending")
    match_reasons: Mapped[list] = mapped_column(JSONB, default=list)
    match_risks: Mapped[list] = mapped_column(JSONB, default=list)
    report_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("reports.id", ondelete="SET NULL"), nullable=True
    )
    # Lightweight souvenir / reusable takeaway from this encounter.
    postcard: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    trip: Mapped["Trip"] = relationship(back_populates="encounters")
    opponent: Mapped["Agent | None"] = relationship(foreign_keys=[opponent_agent_id])
