"""In-memory pub/sub for live streaming (single-instance, no Redis).

The orchestrator publishes SSE-ready events keyed by a channel id (a
``conversation_id`` for dialogue, a ``trip_id`` for the journey stream); the SSE
endpoint subscribes and drains them. Each event gets a monotonic ``_ev`` sequence
so a late subscriber can replay history and then continue live without dupes.

A channel is marked *done* when an event whose name is in ``terminal_events`` is
published (``conversation-end`` for the dialogue bus, ``trip-end`` for trips).
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from collections.abc import Iterable
from typing import Any

Event = dict[str, Any]


class ConversationBus:
    def __init__(self, terminal_events: Iterable[str] = ("conversation-end",)) -> None:
        self._subs: dict[str, set[asyncio.Queue[Event]]] = defaultdict(set)
        self._history: dict[str, list[Event]] = defaultdict(list)
        self._counter: dict[str, int] = defaultdict(int)
        self._done: set[str] = set()
        self._terminal_events = set(terminal_events)

    def publish(self, conversation_id: str, event: Event) -> None:
        """Append to history, tag with ``_ev``, and fan out to live subscribers."""
        cid = str(conversation_id)
        self._counter[cid] += 1
        enriched = {**event, "_ev": self._counter[cid]}
        self._history[cid].append(enriched)
        for q in list(self._subs.get(cid, ())):
            q.put_nowait(enriched)
        if event.get("event") in self._terminal_events:
            self._done.add(cid)

    def subscribe(self, conversation_id: str) -> asyncio.Queue[Event]:
        q: asyncio.Queue[Event] = asyncio.Queue()
        self._subs[str(conversation_id)].add(q)
        return q

    def unsubscribe(self, conversation_id: str, q: asyncio.Queue[Event]) -> None:
        self._subs.get(str(conversation_id), set()).discard(q)

    def history(self, conversation_id: str) -> list[Event]:
        return list(self._history.get(str(conversation_id), []))

    def is_done(self, conversation_id: str) -> bool:
        return str(conversation_id) in self._done

    def reset(self, conversation_id: str) -> None:
        cid = str(conversation_id)
        self._history.pop(cid, None)
        self._counter.pop(cid, None)
        self._done.discard(cid)


# Process-wide singletons: one for conversation dialogue, one for trip journeys.
bus = ConversationBus()
trip_bus = ConversationBus(terminal_events=("trip-end",))
