"""Scenario endpoints: list, get, create (user scenarios), and plaza presence.

``list``/``get``/``create`` plus the **presence** surface (``/{id}/enter``,
``/{id}/leave``, ``/{id}/presence``, ``/{id}/stream`` SSE) are implemented here.
Presence state lives in the in-process registry (:mod:`app.services.presence`);
the SSE event names/payloads are LOCKED by the contract (§4.3).
"""

from __future__ import annotations

import asyncio
import json
import random
import re
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sse_starlette.sse import EventSourceResponse

from app.api.deps import CurrentUser, OptionalUser, SessionDep
from app.models import Agent, Scenario
from app.schemas import (
    PresenceEnterRequest,
    PresenceEntry,
    PresenceLeaveRequest,
    PresenceLeaveResponse,
    PresenceSnapshot,
    ScenarioCreate,
)
from app.schemas import Scenario as ScenarioSchema
from app.services import presence

router = APIRouter(prefix="/scenarios", tags=["scenarios"])

_PING_INTERVAL = 15.0
_KINDS = {"business", "empathy", "generic"}

# Report dialect blurbs keyed by ``kind`` (stored under ``meta.report_dialect``).
_REPORT_DIALECT = {
    "business": "商业评估：可行性 / 风险 / 估值倾向",
    "empathy": "见闻共情：共同点 / 情绪洞察",
    "generic": "通用总结：观点 / 共识 / 分歧",
}
# Default taxonomy bucket per ``kind`` when the body omits ``category``.
_DEFAULT_CATEGORY = {"business": "business", "empathy": "social", "generic": "social"}


def _slugify(text: str) -> str:
    """ASCII slug from a (possibly CJK) name; empty when no ASCII alnum survive."""
    return re.sub(r"[^a-z0-9]+", "-", (text or "").strip().lower()).strip("-")


async def _unique_key(session, base: str) -> str:
    """A scenario ``key`` derived from ``base`` that is free in the table."""
    base = base or f"scn-{uuid.uuid4().hex[:8]}"
    candidate, i = base, 2
    while await session.scalar(select(Scenario.id).where(Scenario.key == candidate)) is not None:
        candidate = f"{base}-{i}"
        i += 1
    return candidate


@router.get("", response_model=list[ScenarioSchema])
async def list_scenarios(
    session: SessionDep,
    current_user: OptionalUser,
    category: str | None = Query(None, description="Filter by meta.category bucket"),
    owner: str | None = Query(None, description="`me` or an owner uuid"),
    is_public: bool | None = Query(None),
) -> list[Scenario]:
    # Visibility: public scenarios, plus the caller's own when authenticated.
    conditions = []
    if current_user is not None:
        conditions.append(or_(Scenario.is_public.is_(True), Scenario.owner_id == current_user.id))
    else:
        conditions.append(Scenario.is_public.is_(True))

    if category:
        conditions.append(Scenario.meta["category"].astext == category)
    if is_public is not None:
        conditions.append(Scenario.is_public.is_(is_public))
    if owner:
        if owner == "me":
            if current_user is None:
                return []
            conditions.append(Scenario.owner_id == current_user.id)
        else:
            try:
                conditions.append(Scenario.owner_id == uuid.UUID(owner))
            except (ValueError, TypeError):
                return []

    rows = (
        await session.scalars(
            select(Scenario).where(*conditions).order_by(Scenario.is_full.desc(), Scenario.key)
        )
    ).all()
    return list(rows)


@router.get("/{id_or_key}", response_model=ScenarioSchema)
async def get_scenario(id_or_key: str, session: SessionDep) -> Scenario:
    scenario: Scenario | None = None
    try:
        scenario_id = uuid.UUID(id_or_key)
        scenario = await session.get(Scenario, scenario_id)
    except (ValueError, TypeError):
        scenario = await session.scalar(select(Scenario).where(Scenario.key == id_or_key))
    if scenario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="scenario not found")
    return scenario


# --------------------------------------------------------------------------- #
# User-created scenarios (refactor-2 §2).                                       #
# --------------------------------------------------------------------------- #
@router.post("", response_model=ScenarioSchema, status_code=status.HTTP_201_CREATED)
async def create_scenario(
    body: ScenarioCreate, current_user: CurrentUser, session: SessionDep
) -> Scenario:
    """Create a user-owned scenario (slugifies a unique ``key``, stamps
    ``owner_id = caller``, merges ``category`` into ``meta``)."""
    kind = body.kind if body.kind in _KINDS else "generic"

    if body.key:
        key = _slugify(body.key) or _slugify(body.name) or f"scn-{uuid.uuid4().hex[:8]}"
        if await session.scalar(select(Scenario.id).where(Scenario.key == key)) is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="scenario key already taken")
    else:
        key = await _unique_key(session, _slugify(body.name))

    # Build ``meta`` (caller overrides win) with renderer-friendly defaults.
    meta = dict(body.meta or {})
    meta.setdefault("category", body.category or _DEFAULT_CATEGORY.get(kind, "social"))
    meta.setdefault("building", key)
    meta.setdefault("x", round(random.uniform(15.0, 85.0), 1))
    meta.setdefault("y", round(random.uniform(15.0, 85.0), 1))
    meta.setdefault("report_dialect", _REPORT_DIALECT.get(kind, _REPORT_DIALECT["generic"]))

    scenario = Scenario(
        key=key,
        name=body.name,
        description=body.description or "",
        kind=kind,
        topics=list(body.topics or []),
        scene_prompt=body.scene_prompt or "",
        ending_prompt=body.ending_prompt or "",
        is_full=True,  # user scenarios are usable stages from creation
        owner_id=current_user.id,
        is_public=bool(body.is_public),
        meta=meta,
    )
    session.add(scenario)
    try:
        await session.commit()
    except IntegrityError:  # racing key collision
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="scenario key already taken"
        ) from None
    await session.refresh(scenario)
    return scenario


# --------------------------------------------------------------------------- #
# Plaza presence (refactor-2 §3/§6) — in-process registry + per-scenario SSE.  #
# --------------------------------------------------------------------------- #
def _spawn_xy(scenario: Scenario, x: float | None, y: float | None) -> tuple[float, float]:
    """Resolve a spawn point: explicit coords → a plaza ``spawn`` point → random."""
    if x is not None and y is not None:
        return float(x), float(y)
    spawns = ((scenario.meta or {}).get("plaza") or {}).get("spawn") or []
    if spawns:
        spot = random.choice(spawns)
        return float(spot.get("x", 50.0)), float(spot.get("y", 50.0))
    return round(random.uniform(30.0, 70.0), 1), round(random.uniform(30.0, 70.0), 1)


def _agent_summary(agent: Agent) -> dict:
    return {
        "id": str(agent.id),
        "name": agent.name,
        "avatar": agent.avatar,
        "profile_tags": list(agent.profile_tags or []),
    }


@router.post("/{scenario_id}/enter", response_model=PresenceEntry)
async def enter_scenario(
    scenario_id: uuid.UUID,
    body: PresenceEnterRequest,
    current_user: CurrentUser,
    session: SessionDep,
) -> PresenceEntry:
    """Mark the caller's agent present in the scenario plaza (heartbeat upsert)."""
    await presence.bootstrap_from_db(session)
    scenario = await session.get(Scenario, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="scenario not found")
    agent = await session.get(Agent, body.agent_id)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="agent not found")
    if agent.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not the owner of this agent")

    x, y = _spawn_xy(scenario, body.x, body.y)
    state = presence.registry.enter(
        scenario.id,
        agent.id,
        user_id=current_user.id,
        kind="user",
        status="idle",
        x=x,
        y=y,
        agent=_agent_summary(agent),
    )
    return PresenceEntry.model_validate(state.public_dict())


@router.post("/{scenario_id}/leave", response_model=PresenceLeaveResponse)
async def leave_scenario(
    scenario_id: uuid.UUID,
    body: PresenceLeaveRequest,
    current_user: CurrentUser,
    session: SessionDep,
) -> PresenceLeaveResponse:
    """Remove the caller's agent from the scenario plaza."""
    scenario = await session.get(Scenario, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="scenario not found")
    left = presence.registry.leave(scenario.id, body.agent_id)
    return PresenceLeaveResponse(scenario_id=scenario.id, agent_id=body.agent_id, left=left)


@router.get("/{scenario_id}/presence", response_model=PresenceSnapshot)
async def get_presence(
    scenario_id: uuid.UUID, session: SessionDep, current_user: OptionalUser
) -> PresenceSnapshot:
    """Snapshot of who is present in the scenario plaza right now."""
    await presence.bootstrap_from_db(session)
    scenario = await session.get(Scenario, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="scenario not found")
    return PresenceSnapshot.model_validate(presence.registry.snapshot_payload(scenario.id))


def _sse(event: dict) -> dict:
    out = {"event": event["event"], "data": json.dumps(event["data"], ensure_ascii=False)}
    if event.get("id") is not None:
        out["id"] = str(event["id"])
    return out


async def _drain_presence(queue: asyncio.Queue) -> AsyncGenerator[dict, None]:
    """Forward live presence deltas; emit a ``ping`` on idle. Runs until the
    client disconnects (presence streams have no terminal event)."""
    while True:
        try:
            ev = await asyncio.wait_for(queue.get(), timeout=_PING_INTERVAL)
        except asyncio.TimeoutError:
            yield {"event": "ping", "data": json.dumps({"t": datetime.now(timezone.utc).isoformat()})}
            continue
        yield _sse(ev)


@router.get("/{scenario_id}/stream")
async def stream_presence(scenario_id: uuid.UUID, session: SessionDep) -> EventSourceResponse:
    """SSE channel of plaza presence events (enter/leave/move/encounter-started)."""
    await presence.bootstrap_from_db(session)
    scenario = await session.get(Scenario, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="scenario not found")

    sid = str(scenario.id)
    # Subscribe *before* taking the snapshot so no delta is lost in the gap; the
    # client applies enter/move/leave idempotently on top of the seed snapshot.
    queue = presence.registry.subscribe(sid)

    async def publisher() -> AsyncGenerator[dict, None]:
        try:
            yield _sse({"event": "presence-snapshot", "data": presence.registry.snapshot_payload(sid)})
            async for out in _drain_presence(queue):
                yield out
        finally:
            presence.registry.unsubscribe(sid, queue)

    return EventSourceResponse(publisher())
