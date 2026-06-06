"""In-memory pub/sub for live conversation streaming (single-instance, no Redis).

The orchestrator publishes SSE-ready events keyed by ``conversation_id``; the SSE
endpoint subscribes and drains them. Each event gets a monotonic ``_ev`` sequence
so a late subscriber can replay history and then continue live without dupes.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

Event = dict[str, Any]


class ConversationBus:
    def __init__(self) -> None:
        self._subs: dict[str, set[asyncio.Queue[Event]]] = defaultdict(set)
        self._history: dict[str, list[Event]] = defaultdict(list)
        self._counter: dict[str, int] = defaultdict(int)
        self._done: set[str] = set()

    def publish(self, conversation_id: str, event: Event) -> None:
        """Append to history, tag with ``_ev``, and fan out to live subscribers."""
        cid = str(conversation_id)
        self._counter[cid] += 1
        enriched = {**event, "_ev": self._counter[cid]}
        self._history[cid].append(enriched)
        for q in list(self._subs.get(cid, ())):
            q.put_nowait(enriched)
        if event.get("event") == "conversation-end":
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


# Process-wide singleton.
bus = ConversationBus()
