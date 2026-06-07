"""In-process **plaza presence** registry (refactor-2 §3/§6).

A lightweight, single-worker analogue of the orchestrator's ``trip_bus``
(:mod:`app.orchestrator.pubsub`): it tracks *which agents/users are standing in
which scenario plaza right now* (with a heartbeat/TTL), and publishes
enter/move/leave/encounter deltas to a **per-scenario SSE bus** that
``GET /api/scenarios/{id}/stream`` drains. State lives in process memory; a
Redis-backed registry is the documented scale-out path (mirrors the single-worker
SSE design already used for conversations/trips) and is **not** required for the
demo.

Two consumers:

* the **2.5D plaza UI** — via ``GET /presence`` (snapshot) + the SSE stream, and
* a sibling **scenario-first matching worker** — via the clean, side-effect-free
  reads :func:`list_present_agent_ids` (the agent ids eligible *here, now*) and
  :func:`snapshot` (the richer per-agent state). Both are plain functions safe to
  call from sync or async code (the data is in-process memory; no awaiting):

  >>> from app.services import presence
  >>> ids = presence.list_present_agent_ids(scenario_id)   # list[uuid.UUID]
  >>> states = presence.snapshot(scenario_id)              # list[PresenceState]

NPCs seeded for a lively boot are *sticky* (``ttl=None``); real user agents expire
``DEFAULT_TTL_SECONDS`` after their last heartbeat (re-calling ``enter`` is the
heartbeat). Expiry is evaluated lazily on every read and emits a ``presence-leave``.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("app.services.presence")

# How long a user agent stays "present" after its last heartbeat (``enter``).
# NPC placements seeded for ambience are sticky (``ttl=None``) and never expire.
DEFAULT_TTL_SECONDS = 60.0

Event = dict[str, Any]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _move_event(sid: str, aid: str, x: float, y: float, status: str) -> Event:
    """A ``presence-move`` SSE event (contract §4.3)."""
    return {
        "event": "presence-move",
        "data": {"scenario_id": sid, "agent_id": aid, "x": x, "y": y, "status": status},
    }


@dataclass
class PresenceState:
    """One agent currently standing in a scenario's plaza.

    Mirrors :class:`app.schemas.presence.PresenceEntry`. ``agent`` is a cached,
    DB-free ``AgentSummary``-shaped dict (``id``/``name``/``avatar``/``profile_tags``)
    captured at enter time so snapshots never touch the database.
    """

    scenario_id: str
    agent_id: str
    user_id: str | None = None
    kind: str = "user"  # user | npc
    status: str = "idle"  # idle | walking | talking
    x: float = 0.0
    y: float = 0.0
    agent: dict | None = None
    joined_at: datetime = field(default_factory=_now)
    last_seen: datetime = field(default_factory=_now)
    # Seconds since ``last_seen`` after which the entry is pruned; ``None`` = sticky.
    ttl: float | None = DEFAULT_TTL_SECONDS

    def is_expired(self, now: datetime | None = None) -> bool:
        if self.ttl is None:
            return False
        now = now or _now()
        return (now - self.last_seen).total_seconds() > self.ttl

    def public_dict(self) -> dict:
        """JSON/Pydantic-ready shape (matches ``PresenceEntry``)."""
        return {
            "agent_id": self.agent_id,
            "user_id": self.user_id,
            "agent": self.agent,
            "kind": self.kind,
            "status": self.status,
            "x": self.x,
            "y": self.y,
            "joined_at": self.joined_at.isoformat() if self.joined_at else None,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
        }


class PresenceRegistry:
    """Process-wide presence state + per-scenario SSE fan-out.

    Single-event-loop design (like ``ConversationBus``): all mutations are
    synchronous and atomic w.r.t. the asyncio loop, so no locks are needed.
    """

    def __init__(self) -> None:
        # scenario_id(str) → agent_id(str) → PresenceState
        self._entries: dict[str, dict[str, PresenceState]] = defaultdict(dict)
        # scenario_id(str) → live SSE subscriber queues
        self._subs: dict[str, set[asyncio.Queue[Event]]] = defaultdict(set)
        self._counter: dict[str, int] = defaultdict(int)

    # ----------------------------------------------------------------- SSE bus
    def subscribe(self, scenario_id: Any) -> asyncio.Queue[Event]:
        q: asyncio.Queue[Event] = asyncio.Queue()
        self._subs[str(scenario_id)].add(q)
        return q

    def unsubscribe(self, scenario_id: Any, q: asyncio.Queue[Event]) -> None:
        self._subs.get(str(scenario_id), set()).discard(q)

    def _publish(self, scenario_id: str, event: Event) -> None:
        self._counter[scenario_id] += 1
        enriched = {**event, "_ev": self._counter[scenario_id]}
        for q in list(self._subs.get(scenario_id, ())):
            try:
                q.put_nowait(enriched)
            except Exception:  # noqa: BLE001 - a slow/closed subscriber must not break presence
                pass

    # --------------------------------------------------------------- mutations
    def enter(
        self,
        scenario_id: Any,
        agent_id: Any,
        *,
        user_id: Any | None = None,
        kind: str = "user",
        status: str = "idle",
        x: float | None = None,
        y: float | None = None,
        agent: dict | None = None,
        ttl: float | None = DEFAULT_TTL_SECONDS,
        publish: bool = True,
    ) -> PresenceState:
        """Upsert presence (also the heartbeat). Publishes ``presence-enter`` on
        first arrival, ``presence-move`` when an existing entry's position/status
        changed, and nothing on a pure heartbeat. ``publish=False`` seeds silently."""
        sid, aid = str(scenario_id), str(agent_id)
        bucket = self._entries[sid]
        now = _now()
        existing = bucket.get(aid)

        if existing is None:
            state = PresenceState(
                scenario_id=sid,
                agent_id=aid,
                user_id=str(user_id) if user_id is not None else None,
                kind=kind,
                status=status,
                x=float(x) if x is not None else 0.0,
                y=float(y) if y is not None else 0.0,
                agent=agent,
                joined_at=now,
                last_seen=now,
                ttl=ttl,
            )
            bucket[aid] = state
            if publish:
                self._publish(
                    sid,
                    {"event": "presence-enter", "data": {"scenario_id": sid, "entry": state.public_dict()}},
                )
            return state

        # Heartbeat / update of an existing occupant.
        moved = False
        if x is not None and abs(existing.x - float(x)) > 1e-9:
            existing.x = float(x)
            moved = True
        if y is not None and abs(existing.y - float(y)) > 1e-9:
            existing.y = float(y)
            moved = True
        if status and status != existing.status:
            existing.status = status
            moved = True
        if agent is not None:
            existing.agent = agent
        if user_id is not None:
            existing.user_id = str(user_id)
        existing.ttl = ttl
        existing.last_seen = now
        if publish and moved:
            self._publish(sid, _move_event(sid, aid, existing.x, existing.y, existing.status))
        return existing

    def move(
        self, scenario_id: Any, agent_id: Any, *, x: float, y: float, status: str | None = None
    ) -> PresenceState | None:
        """Update an occupant's position (and optionally status); publishes ``presence-move``."""
        sid, aid = str(scenario_id), str(agent_id)
        state = self._entries.get(sid, {}).get(aid)
        if state is None:
            return None
        state.x, state.y, state.last_seen = float(x), float(y), _now()
        if status:
            state.status = status
        self._publish(sid, _move_event(sid, aid, state.x, state.y, state.status))
        return state

    def leave(self, scenario_id: Any, agent_id: Any, *, publish: bool = True) -> bool:
        """Remove an occupant; publishes ``presence-leave``. Returns whether present."""
        sid, aid = str(scenario_id), str(agent_id)
        bucket = self._entries.get(sid)
        if not bucket or aid not in bucket:
            return False
        bucket.pop(aid, None)
        if publish:
            self._publish(sid, {"event": "presence-leave", "data": {"scenario_id": sid, "agent_id": aid}})
        return True

    def publish_encounter(
        self, scenario_id: Any, conversation_id: Any, agent_ids: list[Any]
    ) -> None:
        """Mark an in-plaza meeting: flips occupants to ``talking`` and emits
        ``encounter-started`` (the matching worker / trip engine calls this when a
        scenario-first encounter begins)."""
        sid = str(scenario_id)
        ids = [str(a) for a in agent_ids]
        bucket = self._entries.get(sid, {})
        for aid in ids:
            if aid in bucket:
                bucket[aid].status = "talking"
        self._publish(
            sid,
            {
                "event": "encounter-started",
                "data": {"scenario_id": sid, "conversation_id": str(conversation_id), "agent_ids": ids},
            },
        )

    # -------------------------------------------------------------------- reads
    def _prune(self, sid: str) -> None:
        bucket = self._entries.get(sid)
        if not bucket:
            return
        now = _now()
        expired = [aid for aid, st in bucket.items() if st.is_expired(now)]
        for aid in expired:
            bucket.pop(aid, None)
            self._publish(sid, {"event": "presence-leave", "data": {"scenario_id": sid, "agent_id": aid}})

    def snapshot(self, scenario_id: Any) -> list[PresenceState]:
        """Live occupants of a plaza (prunes expired entries first)."""
        sid = str(scenario_id)
        self._prune(sid)
        return list(self._entries.get(sid, {}).values())

    def list_present_agent_ids(self, scenario_id: Any) -> list[uuid.UUID]:
        """Agent ids present in a plaza right now — the matching worker's candidate set."""
        out: list[uuid.UUID] = []
        for st in self.snapshot(scenario_id):
            try:
                out.append(uuid.UUID(st.agent_id))
            except (ValueError, TypeError):
                continue
        return out

    def count(self, scenario_id: Any) -> int:
        return len(self.snapshot(scenario_id))

    def snapshot_payload(self, scenario_id: Any) -> dict:
        """``PresenceSnapshot``-shaped dict (used by ``GET /presence`` + the SSE seed)."""
        sid = str(scenario_id)
        states = self.snapshot(sid)
        return {"scenario_id": sid, "count": len(states), "entries": [s.public_dict() for s in states]}

    def reset(self, scenario_id: Any | None = None) -> None:
        """Drop all presence for a scenario (or everything). For tests/teardown."""
        if scenario_id is None:
            self._entries.clear()
            self._counter.clear()
            return
        sid = str(scenario_id)
        self._entries.pop(sid, None)
        self._counter.pop(sid, None)


# Process-wide singleton.
registry = PresenceRegistry()


# --------------------------------------------------------------------------- #
# Module-level convenience API (the matching worker imports these).
# --------------------------------------------------------------------------- #
def list_present_agent_ids(scenario_id: Any) -> list[uuid.UUID]:
    """Sync read of the agent ids present in ``scenario_id`` (matching candidates)."""
    return registry.list_present_agent_ids(scenario_id)


def snapshot(scenario_id: Any) -> list[PresenceState]:
    """Sync read of the richer per-agent presence state for ``scenario_id``."""
    return registry.snapshot(scenario_id)


def snapshot_payload(scenario_id: Any) -> dict:
    return registry.snapshot_payload(scenario_id)


def count(scenario_id: Any) -> int:
    return registry.count(scenario_id)


async def alist_present_agent_ids(scenario_id: Any) -> list[uuid.UUID]:
    """Async alias of :func:`list_present_agent_ids` (the read is in-memory)."""
    return registry.list_present_agent_ids(scenario_id)


async def asnapshot(scenario_id: Any) -> list[PresenceState]:
    """Async alias of :func:`snapshot`."""
    return registry.snapshot(scenario_id)


# --------------------------------------------------------------------------- #
# NPC bootstrap — populate this *worker's* registry from the seeded DB so plazas
# look lively on boot. Runs at most once per process (the seed runs in a separate
# process, so the server lazily loads the same plan on first plaza access).
# --------------------------------------------------------------------------- #
_bootstrapped = False


async def bootstrap_from_db(session: Any, *, force: bool = False) -> int:
    """Register seeded NPC placements (``app.seeds.data.PLAZA_PRESENCE``) as sticky
    presence in this process. Idempotent + process-guarded. Returns # placed."""
    global _bootstrapped
    if _bootstrapped and not force:
        return 0

    # Imported lazily to keep this service dependency-light + cycle-free.
    from sqlalchemy import select

    from app.models import Agent, Scenario, User
    from app.seeds.data import NPC_USER_EMAIL, PLAZA_PRESENCE

    _bootstrapped = True  # set before awaits so concurrent first-requests don't double-run

    npc_user = await session.scalar(select(User).where(User.email == NPC_USER_EMAIL))
    if npc_user is None:
        return 0

    scn_by_key = {s.key: s for s in (await session.scalars(select(Scenario))).all()}
    agents_by_name = {
        a.name: a
        for a in (await session.scalars(select(Agent).where(Agent.owner_id == npc_user.id))).all()
    }

    placed = 0
    for key, placements in PLAZA_PRESENCE.items():
        scenario = scn_by_key.get(key)
        if scenario is None:
            continue
        for spot in placements:
            agent = agents_by_name.get(spot.get("name"))
            if agent is None:
                continue
            registry.enter(
                scenario.id,
                agent.id,
                user_id=None,
                kind="npc",
                status=spot.get("status", "idle"),
                x=float(spot.get("x", 50.0)),
                y=float(spot.get("y", 50.0)),
                agent={
                    "id": str(agent.id),
                    "name": agent.name,
                    "avatar": agent.avatar,
                    "profile_tags": list(agent.profile_tags or []),
                },
                ttl=None,  # sticky NPC
                publish=False,  # silent seed; the initial snapshot carries them
            )
            placed += 1
    logger.info("presence: bootstrapped %d NPC placements across %d plazas", placed, len(PLAZA_PRESENCE))
    return placed
