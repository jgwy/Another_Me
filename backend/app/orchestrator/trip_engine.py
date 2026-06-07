"""Autonomous trip orchestrator (§6): plan → travel → encounters → return.

One dispatch = one :class:`Trip`. The planner (``services.planner``) picks 2–4
scenes (it no longer pre-matches opponents); the twin then *travels* through the
encounters and — refactor-2 §4 (*scenario-first matching*) — on **arrival** at each
scene the opponent is matched **locally** from who is standing in that plaza right
now (``presence.list_present_agent_ids`` ∩ eligible, with an eligible-all fallback),
and ``presence.registry.publish_encounter`` fires so plazas show ``encounter-started``.
Each encounter reuses the existing conversation **turn protocol**
(R12–R14) + per-encounter SSE — over a configurable real duration, advancing an
``agent_status`` state machine the world map renders live:

    thinking → departing → traveling → meeting → talking → (traveling) → returning → home

Each encounter end yields a per-encounter **report** (from the conversation
engine) + a lightweight **postcard**, and upserts a **relationship**. The trip
end writes an aggregate **summary report** + an inbox **notification** (red dot).

Runs as a single background asyncio task using the in-process ``trip_bus``
(single-worker, like the conversation engine).
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from app.core.db import async_session_maker
from app.models import Agent, Report, Scenario, Trip, TripEncounter
from app.orchestrator.engine import create_conversation, run_conversation
from app.orchestrator.postcards import build_postcard, build_trip_summary
from app.orchestrator.pubsub import trip_bus
from app.services import presence
from app.services.matching import match_opponent_explained
from app.services.notifications import create_notification
from app.services.relationships import upsert_relationship

logger = logging.getLogger("app.orchestrator.trip_engine")

_trip_tasks: dict[str, asyncio.Task] = {}
_cancelled: set[str] = set()


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- #
# Public control surface
# --------------------------------------------------------------------------- #
def start_trip(trip_id: uuid.UUID) -> None:
    """Schedule a planned trip to run in the background (idempotent)."""
    tid = str(trip_id)
    existing = _trip_tasks.get(tid)
    if existing is not None and not existing.done():
        return
    _trip_tasks[tid] = asyncio.create_task(run_trip(trip_id))


def request_cancel(trip_id: uuid.UUID) -> None:
    """Flag a trip for cancellation; the runner stops at its next checkpoint."""
    _cancelled.add(str(trip_id))


def _is_cancelled(trip_id: uuid.UUID) -> bool:
    return str(trip_id) in _cancelled


# --------------------------------------------------------------------------- #
# SSE helpers (trip journey channel — contract §4.2)
# --------------------------------------------------------------------------- #
def _publish(trip_id: uuid.UUID, event: str, data: dict[str, Any]) -> None:
    trip_bus.publish(str(trip_id), {"event": event, "data": data})


async def _set_agent_status(session, trip: Trip, agent_status: str) -> None:
    trip.agent_status = agent_status
    await session.commit()
    _publish(trip.id, "agent-status", {
        "trip_id": str(trip.id), "agent_id": str(trip.agent_id), "agent_status": agent_status,
    })


# --------------------------------------------------------------------------- #
# Runner
# --------------------------------------------------------------------------- #
async def run_trip(trip_id: uuid.UUID) -> None:
    try:
        await _run_trip(trip_id)
    except Exception:  # noqa: BLE001
        logger.exception("trip %s failed", trip_id)
        await _mark_failed(trip_id)
    finally:
        _trip_tasks.pop(str(trip_id), None)
        _cancelled.discard(str(trip_id))


async def _run_trip(trip_id: uuid.UUID) -> None:
    # --- Phase 1: depart -----------------------------------------------------
    async with async_session_maker() as session:
        trip = await session.get(Trip, trip_id)
        if trip is None or trip.status not in ("planning",):
            return
        if _is_cancelled(trip_id):
            await _finalize_cancelled(session, trip)
            return
        encounters = list(
            await session.scalars(
                select(TripEncounter)
                .where(TripEncounter.trip_id == trip_id)
                .order_by(TripEncounter.seq)
            )
        )
        trip.status = "traveling"
        trip.agent_status = "departing"
        trip.started_at = _now()
        await session.commit()
        agent_id = trip.agent_id
        user_id = trip.created_by
        task_prompt = trip.task_prompt
        duration = max(0, int(trip.duration_seconds or 0))
        encounter_ids = [e.id for e in encounters]

    _publish(trip_id, "trip-status", {"trip_id": str(trip_id), "status": "traveling"})
    _publish(trip_id, "agent-status", {
        "trip_id": str(trip_id), "agent_id": str(agent_id), "agent_status": "departing",
    })

    n = max(1, len(encounter_ids))
    travel_slice = min(30.0, duration / (n + 1)) if duration else 0.0
    legs: list[dict[str, Any]] = []

    # --- Phase 2: encounters -------------------------------------------------
    for enc_id in encounter_ids:
        if _is_cancelled(trip_id):
            break

        # Travel to the next scene.
        async with async_session_maker() as session:
            trip = await session.get(Trip, trip_id)
            if trip is None:
                return
            trip.status = "traveling"
            await session.commit()
        _publish(trip_id, "trip-status", {"trip_id": str(trip_id), "status": "traveling"})
        _publish(trip_id, "agent-status", {
            "trip_id": str(trip_id), "agent_id": str(agent_id), "agent_status": "traveling",
        })
        if travel_slice:
            await asyncio.sleep(travel_slice)
        if _is_cancelled(trip_id):
            break

        # Set up the encounter conversation (twin = seat 1, opponent = seat 2).
        async with async_session_maker() as session:
            enc = await session.get(TripEncounter, enc_id)
            trip = await session.get(Trip, trip_id)
            scenario = await session.get(Scenario, enc.scenario_id)
            agent = await session.get(Agent, agent_id)

            # Scenario-first matching (refactor-2 §4): pick the opponent **here, on
            # arrival**, from who is standing in this plaza right now (presence ∩
            # eligible). If the plaza is empty or no one present is eligible, fall
            # back to the scenario's eligible-all so there's always someone to meet.
            opponent: Agent | None = None
            reasons: list[str] = []
            risks: list[str] = []
            if scenario is not None and agent is not None:
                present_ids = {
                    aid
                    for aid in presence.list_present_agent_ids(scenario.id)
                    if aid != agent_id
                }
                if enc.opponent_agent_id is not None:
                    # Defensive: honor an opponent pinned upstream (not done at plan time).
                    opponent = await session.get(Agent, enc.opponent_agent_id)
                if opponent is None and present_ids:
                    opponent, reasons, risks = await match_opponent_explained(
                        session, scenario, agent, candidate_ids=present_ids
                    )
                if opponent is None:  # empty/insufficient plaza → eligible-all fallback
                    opponent, reasons, risks = await match_opponent_explained(
                        session, scenario, agent
                    )

            if scenario is None or agent is None or opponent is None:
                enc.status = "skipped"
                await session.commit()
                _publish(trip_id, "encounter-end", {
                    "trip_id": str(trip_id), "encounter_id": str(enc.id), "seq": enc.seq,
                    "status": "skipped", "report_id": None, "postcard": None,
                })
                continue
            convo = await create_conversation(session, scenario, agent, opponent)
            enc.conversation_id = convo.id
            enc.opponent_agent_id = opponent.id
            enc.match_reasons = list(reasons)
            enc.match_risks = list(risks)
            enc.status = "running"
            trip.status = "in_encounter"
            trip.agent_status = "meeting"
            await session.commit()
            convo_id = convo.id
            enc_seq = enc.seq
            scenario_key = scenario.key
            scenario_id = scenario.id
            opponent_id = opponent.id

        _publish(trip_id, "agent-status", {
            "trip_id": str(trip_id), "agent_id": str(agent_id), "agent_status": "meeting",
        })
        _publish(trip_id, "encounter-start", {
            "trip_id": str(trip_id), "encounter_id": str(enc_id), "seq": enc_seq,
            "scenario_id": str(scenario_id), "scenario_key": scenario_key,
            "opponent_agent_id": str(opponent_id), "conversation_id": str(convo_id),
        })
        # Tell the scene's plaza an encounter just began (flips occupants to
        # ``talking`` + emits ``encounter-started`` on the per-scenario SSE bus).
        presence.registry.publish_encounter(scenario_id, convo_id, [agent_id, opponent_id])
        _publish(trip_id, "agent-status", {
            "trip_id": str(trip_id), "agent_id": str(agent_id), "agent_status": "talking",
        })

        # Run the encounter, reusing the conversation turn protocol + its SSE.
        # task_prompt + dispatched twin are threaded in (no Dispatch row needed).
        await run_conversation(convo_id, task_prompt=task_prompt, dispatched_agent_id=agent_id)

        # Finalize: report → postcard → relationship → notification.
        async with async_session_maker() as session:
            enc = await session.get(TripEncounter, enc_id)
            trip = await session.get(Trip, trip_id)
            scenario = await session.get(Scenario, scenario_id)
            agent = await session.get(Agent, agent_id)
            opponent = await session.get(Agent, opponent_id)
            report = await session.scalar(
                select(Report).where(Report.conversation_id == convo_id)
            )
            postcard = build_postcard(scenario, agent, opponent, report)
            enc.report_id = report.id if report is not None else None
            enc.postcard = postcard
            enc.status = "completed"

            await upsert_relationship(
                session,
                owner_id=user_id,
                from_agent_id=agent_id,
                to_agent_id=opponent_id,
                scenario=scenario,
                conversation_id=convo_id,
            )
            await create_notification(
                session,
                user_id=user_id,
                kind="postcard",
                title=postcard.get("title") or "新的明信片",
                body=postcard.get("highlight"),
                data={
                    "trip_id": trip_id,
                    "encounter_id": enc_id,
                    "conversation_id": convo_id,
                    "report_id": report.id if report is not None else None,
                    "agent_id": agent_id,
                },
            )
            trip.status = "traveling"
            await session.commit()
            report_id = report.id if report is not None else None
            legs.append({
                "seq": enc_seq,
                "scenario_key": scenario_key,
                "scenario_name": scenario.name,
                "opponent": opponent.name,
                "kind": report.kind if report is not None else scenario.kind,
                "report_id": str(report_id) if report_id else None,
                "conversation_id": str(convo_id),
                "headline": report.summary if report is not None else None,
                "postcard": postcard,
            })

        _publish(trip_id, "encounter-end", {
            "trip_id": str(trip_id), "encounter_id": str(enc_id), "seq": enc_seq,
            "status": "completed", "report_id": str(report_id) if report_id else None,
            "postcard": postcard,
        })

    # --- Phase 3: return + summary ------------------------------------------
    if _is_cancelled(trip_id):
        async with async_session_maker() as session:
            trip = await session.get(Trip, trip_id)
            if trip is not None:
                await _finalize_cancelled(session, trip)
        return

    _publish(trip_id, "trip-status", {"trip_id": str(trip_id), "status": "returning"})
    _publish(trip_id, "agent-status", {
        "trip_id": str(trip_id), "agent_id": str(agent_id), "agent_status": "returning",
    })
    async with async_session_maker() as session:
        trip = await session.get(Trip, trip_id)
        if trip is not None:
            trip.status = "returning"
            await session.commit()
    if travel_slice:
        await asyncio.sleep(travel_slice)

    async with async_session_maker() as session:
        trip = await session.get(Trip, trip_id)
        agent = await session.get(Agent, agent_id)
        if trip is None or agent is None:
            return
        summary, content = build_trip_summary(agent, task_prompt, legs)
        summary_report = Report(
            conversation_id=None, kind="trip_summary", summary=summary, content=content
        )
        session.add(summary_report)
        await session.flush()
        trip.summary_report_id = summary_report.id
        trip.status = "completed"
        trip.agent_status = "home"
        trip.ended_at = _now()
        await create_notification(
            session,
            user_id=user_id,
            kind="trip_completed",
            title=f"{agent.name} 旅行归来",
            body=summary,
            data={
                "trip_id": trip_id,
                "report_id": summary_report.id,
                "agent_id": agent_id,
            },
        )
        await session.commit()
        summary_report_id = summary_report.id

    _publish(trip_id, "agent-status", {
        "trip_id": str(trip_id), "agent_id": str(agent_id), "agent_status": "home",
    })
    _publish(trip_id, "trip-end", {
        "trip_id": str(trip_id), "status": "completed", "summary_report_id": str(summary_report_id),
    })


async def _finalize_cancelled(session, trip: Trip) -> None:
    trip.status = "cancelled"
    trip.agent_status = "home"
    trip.ended_at = _now()
    await session.commit()
    _publish(trip.id, "agent-status", {
        "trip_id": str(trip.id), "agent_id": str(trip.agent_id), "agent_status": "home",
    })
    _publish(trip.id, "trip-end", {
        "trip_id": str(trip.id), "status": "cancelled", "summary_report_id": None,
    })


async def _mark_failed(trip_id: uuid.UUID) -> None:
    try:
        async with async_session_maker() as session:
            trip = await session.get(Trip, trip_id)
            if trip is not None and trip.status not in ("completed", "failed", "cancelled"):
                trip.status = "failed"
                trip.agent_status = "home"
                trip.ended_at = _now()
                await session.commit()
    except Exception:  # noqa: BLE001
        logger.exception("failed to mark trip %s failed", trip_id)
    _publish(trip_id, "trip-end", {
        "trip_id": str(trip_id), "status": "failed", "summary_report_id": None,
    })
