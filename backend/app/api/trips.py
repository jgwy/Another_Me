"""Trip endpoints (§6: autonomous multi-encounter journeys).

``POST /api/trips`` plans the journey synchronously (the autonomous planner picks
scenes + explainably matches opponents, persisting ``Trip.plan`` + pending
``TripEncounter`` rows) and then runs it in the background via the trip engine.
The world map spectates the journey through ``GET /api/trips/{id}/stream`` (events
in api-contract.md §4.2); each leg's dialogue is spectated via the existing
conversation stream.
"""

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

from app.api.deps import CurrentUser, SessionDep
from app.core.config import get_settings
from app.core.db import async_session_maker
from app.models import Agent
from app.models import Trip as TripModel
from app.models import TripEncounter as TripEncounterModel
from app.orchestrator import request_cancel, start_trip, trip_bus
from app.schemas import Page, Trip, TripCreate, TripEncounter
from app.services.planner import plan_trip

router = APIRouter(prefix="/trips", tags=["trips"])

_PING_INTERVAL = 15.0
_TERMINAL = ("completed", "failed", "cancelled")


def _trip_query():
    return select(TripModel).options(
        selectinload(TripModel.agent),
        selectinload(TripModel.encounters).selectinload(TripEncounterModel.opponent),
    )


async def _load_trip(session, trip_id: uuid.UUID) -> TripModel | None:
    return await session.scalar(_trip_query().where(TripModel.id == trip_id))


@router.post("", response_model=Trip, status_code=status.HTTP_201_CREATED)
async def create_trip(body: TripCreate, current_user: CurrentUser, session: SessionDep) -> Trip:
    agent = await session.scalar(
        select(Agent).where(Agent.id == body.agent_id).options(selectinload(Agent.skills))
    )
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="agent not found")
    if agent.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not the owner of this agent")

    settings = get_settings()
    duration = body.duration_seconds if body.duration_seconds is not None else settings.trip_duration
    duration = max(0, int(duration))

    trip = TripModel(
        agent_id=agent.id,
        created_by=current_user.id,
        task_prompt=body.task_prompt,
        status="planning",
        agent_status="thinking",
        duration_seconds=duration,
        plan={},
    )
    session.add(trip)
    await session.flush()

    # Plan synchronously so the response already carries the route + pending legs.
    planned = await plan_trip(
        session,
        agent,
        body.task_prompt,
        max_encounters=body.max_encounters,
        scenario_hints=body.scenario_hints,
    )
    stops_payload = []
    for i, stop in enumerate(planned.stops):
        session.add(
            TripEncounterModel(
                trip_id=trip.id,
                seq=i,
                scenario_id=stop.scenario.id,
                scenario_key=stop.scenario.key,
                opponent_agent_id=stop.opponent.id if stop.opponent is not None else None,
                status="pending",
                match_reasons=list(stop.reasons),
                match_risks=list(stop.risks),
            )
        )
        stops_payload.append(
            {
                "scenario_id": str(stop.scenario.id),
                "scenario_key": stop.scenario.key,
                "opponent_agent_id": str(stop.opponent.id) if stop.opponent is not None else None,
                "reasons": list(stop.reasons),
                "risks": list(stop.risks),
            }
        )
    trip.plan = {"summary": planned.summary, "stops": stops_payload}
    await session.commit()

    trip_full = await _load_trip(session, trip.id)
    assert trip_full is not None
    # Kick off the background journey (travel → encounters → return).
    start_trip(trip.id)
    return Trip.model_validate(trip_full)


@router.get("", response_model=Page[Trip])
async def list_trips(
    current_user: CurrentUser,
    session: SessionDep,
    status_filter: str | None = Query(None, alias="status"),
    agent_id: uuid.UUID | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> Page[Trip]:
    conditions = [TripModel.created_by == current_user.id]
    if status_filter:
        conditions.append(TripModel.status == status_filter)
    if agent_id is not None:
        conditions.append(TripModel.agent_id == agent_id)

    total = await session.scalar(select(func.count()).select_from(TripModel).where(*conditions)) or 0
    rows = (
        await session.scalars(
            _trip_query().where(*conditions).order_by(TripModel.created_at.desc()).limit(limit).offset(offset)
        )
    ).all()
    items = [Trip.model_validate(t) for t in rows]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/{trip_id}", response_model=Trip)
async def get_trip(trip_id: uuid.UUID, current_user: CurrentUser, session: SessionDep) -> Trip:
    trip = await _load_trip(session, trip_id)
    if trip is None or trip.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="trip not found")
    return Trip.model_validate(trip)


@router.get("/{trip_id}/encounters", response_model=list[TripEncounter])
async def list_trip_encounters(
    trip_id: uuid.UUID, current_user: CurrentUser, session: SessionDep
) -> list[TripEncounter]:
    trip = await session.get(TripModel, trip_id)
    if trip is None or trip.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="trip not found")
    rows = (
        await session.scalars(
            select(TripEncounterModel)
            .where(TripEncounterModel.trip_id == trip_id)
            .order_by(TripEncounterModel.seq)
            .options(selectinload(TripEncounterModel.opponent))
        )
    ).all()
    return [TripEncounter.model_validate(e) for e in rows]


@router.post("/{trip_id}/cancel", response_model=Trip)
async def cancel_trip(trip_id: uuid.UUID, current_user: CurrentUser, session: SessionDep) -> Trip:
    trip = await session.get(TripModel, trip_id)
    if trip is None or trip.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="trip not found")
    if trip.status not in _TERMINAL:
        request_cancel(trip_id)
        trip.status = "cancelled"
        trip.agent_status = "home"
        trip.ended_at = datetime.now(timezone.utc)
        await session.commit()
    full = await _load_trip(session, trip_id)
    assert full is not None
    return Trip.model_validate(full)


# --------------------------------------------------------------------------- #
# Journey SSE (contract §4.2) — public read, like the conversation stream.
# --------------------------------------------------------------------------- #
def _sse(event: dict) -> dict:
    out = {"event": event["event"], "data": json.dumps(event["data"], ensure_ascii=False)}
    if event.get("id") is not None:
        out["id"] = str(event["id"])
    return out


async def _drain_live(queue: asyncio.Queue, last_ev: int) -> AsyncGenerator[dict, None]:
    while True:
        try:
            ev = await asyncio.wait_for(queue.get(), timeout=_PING_INTERVAL)
        except asyncio.TimeoutError:
            yield {"event": "ping", "data": json.dumps({"t": datetime.now(timezone.utc).isoformat()})}
            continue
        if ev.get("_ev", 0) <= last_ev:
            continue
        yield _sse(ev)
        if ev.get("event") == "trip-end":
            return


async def _db_replay_trip(trip_id: uuid.UUID) -> AsyncGenerator[dict, None]:
    """Reconstruct the journey stream from persisted rows (finished trips)."""
    async with async_session_maker() as session:
        trip = await session.get(TripModel, trip_id)
        if trip is None:
            return
        tid = str(trip_id)
        yield _sse({"event": "trip-status", "data": {"trip_id": tid, "status": trip.status}})
        yield _sse({
            "event": "agent-status",
            "data": {"trip_id": tid, "agent_id": str(trip.agent_id), "agent_status": trip.agent_status},
        })
        encounters = (
            await session.scalars(
                select(TripEncounterModel)
                .where(TripEncounterModel.trip_id == trip_id)
                .order_by(TripEncounterModel.seq)
            )
        ).all()
        for e in encounters:
            if e.conversation_id is not None:
                yield _sse({
                    "event": "encounter-start",
                    "data": {
                        "trip_id": tid, "encounter_id": str(e.id), "seq": e.seq,
                        "scenario_id": str(e.scenario_id), "scenario_key": e.scenario_key,
                        "opponent_agent_id": str(e.opponent_agent_id) if e.opponent_agent_id else None,
                        "conversation_id": str(e.conversation_id),
                    },
                })
            if e.status in ("completed", "skipped", "failed"):
                yield _sse({
                    "event": "encounter-end",
                    "data": {
                        "trip_id": tid, "encounter_id": str(e.id), "seq": e.seq,
                        "status": e.status,
                        "report_id": str(e.report_id) if e.report_id else None,
                        "postcard": e.postcard,
                    },
                })
        if trip.status in _TERMINAL:
            yield _sse({
                "event": "trip-end",
                "data": {
                    "trip_id": tid, "status": trip.status,
                    "summary_report_id": str(trip.summary_report_id) if trip.summary_report_id else None,
                },
            })


@router.get("/{trip_id}/stream")
async def stream_trip(trip_id: uuid.UUID, session: SessionDep) -> EventSourceResponse:
    trip = await session.get(TripModel, trip_id)
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="trip not found")

    tid = str(trip_id)
    queue = trip_bus.subscribe(tid)
    snapshot = trip_bus.history(tid)
    trip_status = trip.status

    async def publisher() -> AsyncGenerator[dict, None]:
        try:
            last_ev = 0
            if snapshot:
                for ev in snapshot:
                    last_ev = ev.get("_ev", last_ev)
                    yield _sse(ev)
                if trip_bus.is_done(tid):
                    return
                async for out in _drain_live(queue, last_ev):
                    yield out
            else:
                async for out in _db_replay_trip(trip_id):
                    yield out
                if trip_status in _TERMINAL:
                    return
                async for out in _drain_live(queue, 0):
                    yield out
        finally:
            trip_bus.unsubscribe(tid, queue)

    return EventSourceResponse(publisher())
