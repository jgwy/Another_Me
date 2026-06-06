"""Conversation endpoints: list, get, messages (transcript), and the live SSE
stream. SSE event names + payloads are LOCKED by the contract (§4)."""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sse_starlette.sse import EventSourceResponse

from app.api.deps import OptionalUser, SessionDep
from app.core.db import async_session_maker
from app.models import Conversation, ConversationParticipant, Message, Report, SandboxRun
from app.orchestrator import bus
from app.schemas import Conversation as ConversationSchema
from app.schemas import Message as MessageSchema
from app.schemas import Page

router = APIRouter(prefix="/conversations", tags=["conversations"])

_PING_INTERVAL = 15.0


async def _load_conversation(session, conversation_id: uuid.UUID) -> Conversation | None:
    return await session.scalar(
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .options(
            selectinload(Conversation.participants).selectinload(ConversationParticipant.agent)
        )
    )


@router.get("", response_model=Page[ConversationSchema])
async def list_conversations(
    session: SessionDep,
    current_user: OptionalUser,
    scenario_id: uuid.UUID | None = Query(None),
    agent_id: uuid.UUID | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> Page[ConversationSchema]:
    conditions = []
    if scenario_id is not None:
        conditions.append(Conversation.scenario_id == scenario_id)
    if status_filter:
        conditions.append(Conversation.status == status_filter)
    if agent_id is not None:
        conditions.append(
            Conversation.id.in_(
                select(ConversationParticipant.conversation_id).where(
                    ConversationParticipant.agent_id == agent_id
                )
            )
        )

    total = await session.scalar(
        select(func.count()).select_from(Conversation).where(*conditions)
    ) or 0
    rows = (
        await session.scalars(
            select(Conversation)
            .where(*conditions)
            .options(
                selectinload(Conversation.participants).selectinload(ConversationParticipant.agent)
            )
            .order_by(Conversation.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    items = [ConversationSchema.model_validate(c) for c in rows]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/{conversation_id}", response_model=ConversationSchema)
async def get_conversation(
    conversation_id: uuid.UUID,
    session: SessionDep,
    current_user: OptionalUser,
) -> Conversation:
    convo = await _load_conversation(session, conversation_id)
    if convo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="conversation not found")
    return convo


@router.get("/{conversation_id}/messages", response_model=list[MessageSchema])
async def list_messages(
    conversation_id: uuid.UUID,
    session: SessionDep,
    current_user: OptionalUser,
    after_seq: int | None = Query(None, description="Return messages with seq > after_seq"),
    limit: int = Query(200, ge=1, le=1000),
) -> list[Message]:
    convo = await session.get(Conversation, conversation_id)
    if convo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="conversation not found")
    conditions = [Message.conversation_id == conversation_id]
    if after_seq is not None:
        conditions.append(Message.seq > after_seq)
    rows = (
        await session.scalars(
            select(Message).where(*conditions).order_by(Message.seq).limit(limit)
        )
    ).all()
    return list(rows)


def _sse(event: dict) -> dict:
    out = {"event": event["event"], "data": json.dumps(event["data"], ensure_ascii=False)}
    if event.get("id") is not None:
        out["id"] = str(event["id"])
    return out


async def _db_replay(conversation_id: uuid.UUID) -> AsyncGenerator[dict, None]:
    """Reconstruct the stream from persisted rows (for already-finished runs)."""
    async with async_session_maker() as session:
        convo = await session.get(Conversation, conversation_id)
        if convo is None:
            return
        messages = (
            await session.scalars(
                select(Message)
                .where(Message.conversation_id == conversation_id)
                .order_by(Message.seq)
            )
        ).all()
        runs = (
            await session.scalars(
                select(SandboxRun).where(SandboxRun.conversation_id == conversation_id)
            )
        ).all()
        runs_by_id = {str(r.id): r for r in runs}
        cid = str(conversation_id)

        for m in messages:
            if m.sender == "sandbox":
                run = runs_by_id.get(str((m.meta or {}).get("sandbox_run_id")))
                yield _sse(
                    {
                        "event": "sandbox-output",
                        "id": m.seq,
                        "data": {
                            "conversation_id": cid,
                            "message_id": str(m.id),
                            "sandbox_run_id": str(run.id) if run else (m.meta or {}).get("sandbox_run_id"),
                            "agent_id": str(m.agent_id) if m.agent_id else None,
                            "language": (m.meta or {}).get("language", "python"),
                            "stdout": run.stdout if run else m.content,
                            "stderr": run.stderr if run else "",
                            "exit_code": run.exit_code if run else (m.meta or {}).get("exit_code", 0),
                            "duration_ms": run.duration_ms if run else (m.meta or {}).get("duration_ms", 0),
                        },
                    }
                )
                continue
            base = {
                "conversation_id": cid,
                "message_id": str(m.id),
                "seq": m.seq,
                "turn_index": m.turn_index,
                "agent_id": str(m.agent_id) if m.agent_id else None,
                "sender": m.sender,
            }
            yield _sse({"event": "message-start", "id": m.seq, "data": dict(base)})
            yield _sse(
                {
                    "event": "message-end",
                    "id": m.seq,
                    "data": {**base, "content": m.content, "meta": m.meta or {}},
                }
            )

        if convo.status in ("completed", "failed"):
            report = await session.scalar(
                select(Report).where(Report.conversation_id == conversation_id)
            )
            yield _sse(
                {
                    "event": "conversation-end",
                    "data": {
                        "conversation_id": cid,
                        "status": convo.status,
                        "n_rounds": convo.n_rounds,
                        "report_id": str(report.id) if report else None,
                    },
                }
            )


@router.get("/{conversation_id}/stream")
async def stream_conversation(
    conversation_id: uuid.UUID,
    session: SessionDep,
    token: str | None = Query(None, description="JWT for private conversations (EventSource can't set headers)"),
) -> EventSourceResponse:
    convo = await session.get(Conversation, conversation_id)
    if convo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="conversation not found")

    cid = str(conversation_id)
    queue = bus.subscribe(cid)
    snapshot = bus.history(cid)
    convo_status = convo.status

    async def publisher() -> AsyncGenerator[dict, None]:
        try:
            last_ev = 0
            if snapshot:
                for ev in snapshot:
                    last_ev = ev.get("_ev", last_ev)
                    yield _sse(ev)
                if bus.is_done(cid):
                    return
                async for out in _drain_live(queue, last_ev):
                    yield out
            else:
                async for out in _db_replay(conversation_id):
                    yield out
                if convo_status in ("completed", "failed"):
                    return
                async for out in _drain_live(queue, 0):
                    yield out
        finally:
            bus.unsubscribe(cid, queue)

    return EventSourceResponse(publisher())


async def _drain_live(queue: asyncio.Queue, last_ev: int) -> AsyncGenerator[dict, None]:
    """Forward live events with ``_ev > last_ev``; ping on idle; stop on end."""
    while True:
        try:
            ev = await asyncio.wait_for(queue.get(), timeout=_PING_INTERVAL)
        except asyncio.TimeoutError:
            yield {"event": "ping", "data": json.dumps({"t": datetime.now(timezone.utc).isoformat()})}
            continue
        if ev.get("_ev", 0) <= last_ev:
            continue
        yield _sse(ev)
        if ev.get("event") == "conversation-end":
            return
