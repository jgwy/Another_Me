"""Inbox / notification endpoints (§7).

Surfaces what a user's twins brought back (trip/encounter completions, ready
reports, postcards, relationship updates) and drives the unread red-dot.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select, update

from app.api.deps import CurrentUser, SessionDep
from app.models import Notification as NotificationModel
from app.schemas import InboxReadAllResponse, Notification, Page, UnreadCountResponse

router = APIRouter(prefix="/inbox", tags=["inbox"])


@router.get("", response_model=Page[Notification])
async def list_notifications(
    current_user: CurrentUser,
    session: SessionDep,
    unread: bool | None = Query(None, description="Only unread when true"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> Page[Notification]:
    conditions = [NotificationModel.user_id == current_user.id]
    if unread is True:
        conditions.append(NotificationModel.read.is_(False))
    elif unread is False:
        conditions.append(NotificationModel.read.is_(True))

    total = await session.scalar(
        select(func.count()).select_from(NotificationModel).where(*conditions)
    ) or 0
    rows = (
        await session.scalars(
            select(NotificationModel)
            .where(*conditions)
            .order_by(NotificationModel.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    items = [Notification.model_validate(n) for n in rows]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/unread_count", response_model=UnreadCountResponse)
async def unread_count(current_user: CurrentUser, session: SessionDep) -> UnreadCountResponse:
    count = await session.scalar(
        select(func.count())
        .select_from(NotificationModel)
        .where(
            NotificationModel.user_id == current_user.id,
            NotificationModel.read.is_(False),
        )
    ) or 0
    return UnreadCountResponse(count=count)


@router.post("/read_all", response_model=InboxReadAllResponse)
async def mark_all_read(current_user: CurrentUser, session: SessionDep) -> InboxReadAllResponse:
    result = await session.execute(
        update(NotificationModel)
        .where(
            NotificationModel.user_id == current_user.id,
            NotificationModel.read.is_(False),
        )
        .values(read=True, read_at=datetime.now(timezone.utc))
    )
    updated = result.rowcount or 0
    await session.commit()
    return InboxReadAllResponse(updated=updated)


@router.post("/{notification_id}/read", response_model=Notification)
async def mark_read(
    notification_id: uuid.UUID, current_user: CurrentUser, session: SessionDep
) -> Notification:
    notification = await session.get(NotificationModel, notification_id)
    if notification is None or notification.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="notification not found")
    if not notification.read:
        notification.read = True
        notification.read_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(notification)
    return Notification.model_validate(notification)
