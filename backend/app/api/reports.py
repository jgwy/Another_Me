"""Report endpoints: canonical conversation-scoped path + convenience by id."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import SessionDep
from app.models import Conversation, Report
from app.schemas import Report as ReportSchema

router = APIRouter(tags=["reports"])


@router.get("/conversations/{conversation_id}/report", response_model=ReportSchema)
async def get_conversation_report(conversation_id: uuid.UUID, session: SessionDep) -> Report:
    convo = await session.get(Conversation, conversation_id)
    if convo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="conversation not found")
    report = await session.scalar(
        select(Report).where(Report.conversation_id == conversation_id)
    )
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="report not generated yet",
        )
    return report


@router.get("/reports/{report_id}", response_model=ReportSchema)
async def get_report(report_id: uuid.UUID, session: SessionDep) -> Report:
    report = await session.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="report not found")
    return report
