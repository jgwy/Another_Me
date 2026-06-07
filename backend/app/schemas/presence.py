"""Presence schemas (§3/§6 — lightweight multiplayer "who's in this plaza").

Lock contract for the per-scenario presence surface:
``POST /api/scenarios/{id}/enter`` · ``/leave`` · ``GET /api/scenarios/{id}/presence``
and the SSE channel ``GET /api/scenarios/{id}/stream``. The presence registry
(in-process, heartbeat/TTL) + SSE wiring are owned by Phase 2; shapes here are final.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.agent import AgentSummary

# PresenceEntry.kind:   user | npc
# PresenceEntry.status: idle | walking | talking


class PresenceEntry(BaseModel):
    """One agent currently present in a scenario's plaza."""

    agent_id: uuid.UUID
    # Owner of the agent (null for system NPCs).
    user_id: uuid.UUID | None = None
    agent: AgentSummary | None = None
    kind: str = "user"
    status: str = "idle"
    # Plaza coordinates on the 0..100 grid (2.5D world).
    x: float = 0.0
    y: float = 0.0
    joined_at: datetime | None = None
    last_seen: datetime | None = None


class PresenceSnapshot(BaseModel):
    """The set of agents present in a scenario right now."""

    scenario_id: uuid.UUID
    count: int = 0
    entries: list[PresenceEntry] = Field(default_factory=list)


class PresenceEnterRequest(BaseModel):
    agent_id: uuid.UUID
    # Optional spawn position; server picks a free spot when omitted.
    x: float | None = None
    y: float | None = None


class PresenceLeaveRequest(BaseModel):
    agent_id: uuid.UUID


class PresenceLeaveResponse(BaseModel):
    scenario_id: uuid.UUID
    agent_id: uuid.UUID
    left: bool = True
