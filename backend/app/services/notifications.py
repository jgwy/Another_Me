"""Inbox notification helpers (§7).

A tiny write-side helper used by the trip orchestrator (and any other producer)
to drop a :class:`Notification` into a user's inbox. The inbox API reads these
back and the unread count drives the red dot. The caller owns the transaction
(this only ``add`` + ``flush``).
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification

# kind ∈ trip_completed | encounter_completed | report_ready | postcard
#       | relationship_update | marketplace | system
VALID_KINDS = {
    "trip_completed",
    "encounter_completed",
    "report_ready",
    "postcard",
    "relationship_update",
    "marketplace",
    "system",
}


async def create_notification(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    kind: str,
    title: str,
    body: str | None = None,
    data: dict[str, Any] | None = None,
) -> Notification:
    """Create and flush a notification for ``user_id`` (no commit)."""
    note = Notification(
        user_id=user_id,
        kind=kind if kind in VALID_KINDS else "system",
        title=title,
        body=body,
        data=_clean_data(data or {}),
    )
    session.add(note)
    await session.flush()
    return note


def _clean_data(data: dict[str, Any]) -> dict[str, Any]:
    """Coerce uuid values in the deep-link payload to strings (JSON-safe)."""
    out: dict[str, Any] = {}
    for key, value in data.items():
        if value is None:
            continue
        out[key] = str(value) if isinstance(value, uuid.UUID) else value
    return out
