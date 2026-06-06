"""Trip schemas (§6: autonomous "travelling-frog" social journey).

One dispatch = one **Trip**: the user gives a Task + prompt, an autonomous planner
picks scenes and (explainably) matches opponents, and the twin travels through
**2–4 encounters** asynchronously over a configurable duration. The world map
renders the journey live from ``status`` / ``agent_status``.

This is a locked contract; the autonomous-orchestrator workstream implements the
bodies + adds the ``trips`` / ``trip_encounters`` models & migration.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.agent import AgentSummary

# Trip.status:        planning | traveling | in_encounter | returning | completed | failed | cancelled
# Trip.agent_status:  idle | thinking | departing | traveling | meeting | talking | returning | home
# TripEncounter.status: pending | running | completed | failed | skipped


class TripStop(BaseModel):
    """A single planned stop in the autonomous route (explainable match)."""

    scenario_id: uuid.UUID | None = None
    scenario_key: str | None = None
    opponent_agent_id: uuid.UUID | None = None
    reasons: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)


class TripPlan(BaseModel):
    """Autonomous planner output stored on ``Trip.plan``."""

    summary: str = ""
    stops: list[TripStop] = Field(default_factory=list)


class TripEncounter(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    trip_id: uuid.UUID
    seq: int
    scenario_id: uuid.UUID
    scenario_key: str | None = None
    opponent_agent_id: uuid.UUID | None = None
    conversation_id: uuid.UUID | None = None
    status: str = "pending"
    match_reasons: list[str] = Field(default_factory=list)
    match_risks: list[str] = Field(default_factory=list)
    report_id: uuid.UUID | None = None
    # Lightweight souvenir / reusable takeaway from this encounter.
    postcard: dict[str, Any] | None = None
    opponent: AgentSummary | None = None
    created_at: datetime


class Trip(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    agent_id: uuid.UUID
    created_by: uuid.UUID
    task_prompt: str
    status: str = "planning"
    agent_status: str = "idle"
    plan: dict[str, Any] = Field(default_factory=dict)
    duration_seconds: int = 0
    encounters: list[TripEncounter] = Field(default_factory=list)
    # Whole-journey report aggregating the per-encounter reports.
    summary_report_id: uuid.UUID | None = None
    agent: AgentSummary | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class TripCreate(BaseModel):
    agent_id: uuid.UUID
    task_prompt: str
    # Planner knobs (all optional → planner/env defaults apply).
    max_encounters: int | None = None
    duration_seconds: int | None = None
    # Optional scene biases (scenario keys) for the planner.
    scenario_hints: list[str] = Field(default_factory=list)
