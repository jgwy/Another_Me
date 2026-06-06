"""Inbox / notification schemas (§7).

The inbox surfaces what a user's twins brought back — trip/encounter completions,
ready reports, postcards, relationship updates — and drives the unread red-dot.

Locked contract; the reports-postcards-inbox workstream implements the bodies +
adds the ``notifications`` model & migration.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class Notification(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    # trip_completed | encounter_completed | report_ready | postcard
    #   | relationship_update | marketplace | system
    kind: str
    title: str
    body: str | None = None
    read: bool = False
    # Deep-link payload, e.g. { "trip_id", "encounter_id", "conversation_id",
    # "report_id", "agent_id", "item_id" } (all optional).
    data: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    read_at: datetime | None = None


class UnreadCountResponse(BaseModel):
    """Response for ``GET /api/inbox/unread_count`` (drives the red dot)."""

    count: int


class InboxReadAllResponse(BaseModel):
    """Response for ``POST /api/inbox/read_all``."""

    updated: int
