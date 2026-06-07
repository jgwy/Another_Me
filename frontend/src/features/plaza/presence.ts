/**
 * Plaza presence data layer (refactor plan §6 presence + §7 plaza).
 *
 * This is the typed seam the plaza renders against. Following the project
 * data pattern (`lib/trips.ts`), every request tries the real endpoint first and
 * falls back to a typed mock (flipping demo mode) so the plaza stays alive
 * without a backend:
 *
 *   - snapshot:  `GET /api/scenarios/{id}/presence`  → who is in this plaza now
 *   - live:      `GET /api/scenarios/{id}/stream`    → presence + encounter deltas
 *
 * The SSE channel + the REST snapshot speak backend A's **locked contract**
 * (`docs/api-contract.md` §4.3): the wire carries `PresenceEntry` rows
 * (`agent_id`/`agent`/`kind`/`status:idle|walking|talking`/`x`/`y`) and the events
 * are `presence-snapshot` / `presence-enter` / `presence-move` / `presence-leave`
 * / `encounter-started` (+ `ping` keepalives). This module normalizes those wire
 * rows into the UI-facing {@link PresenceTwin} (whose `status` is the world's
 * `AgentStatus`) so the plaza stage/panels stay unchanged. For a real plaza the
 * SSE deltas drive the live set; for the mock it runs a gentle client-side
 * simulator instead.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { API_BASE_URL, apiFetch } from "../../lib/api";
import type { AgentSummary } from "../../lib/api";
import type { AgentStatus } from "../../lib/trips";
import { useDemoMode, useDemoStore } from "../../lib/queries";
import { mockStore, pickAvatar } from "../../lib/mocks";
import { hashIndex } from "../../lib/format";

/* -------------------------------------------------------------------------- */
/* UI objects — what the plaza stage/panels render against.                    */
/* -------------------------------------------------------------------------- */

/** One twin currently standing in a plaza. */
export interface PresenceTwin {
  agent_id: string;
  agent: AgentSummary;
  /** The twin's live phase — drives its little-character status dots. */
  status: AgentStatus;
  trip_id: string | null;
  /** Set while this twin is mid-encounter here. */
  encounter_id: string | null;
  /** Spectatable when in an encounter. */
  conversation_id: string | null;
  /** True for the caller's own travelling twin (overlaid from the journey). */
  is_self: boolean;
  entered_at: string;
}

/** An encounter happening in this plaza right now (one trip = many of these). */
export interface PlazaEncounter {
  id: string;
  scenario_id: string;
  conversation_id: string | null;
  status: "running" | "completed";
  participants: AgentSummary[];
  started_at: string;
}

/** Point-in-time snapshot of a plaza (UI shape). */
export interface PresenceSnapshot {
  scenario_id: string;
  present: PresenceTwin[];
  encounters: PlazaEncounter[];
  count: number;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* Wire types + normalization — backend A's locked presence contract (§4.3).   */
/* -------------------------------------------------------------------------- */

/** A `PresenceEntry` row as it arrives over the wire (snapshot + enter event). */
interface PresenceEntryWire {
  agent_id: string;
  user_id: string | null;
  agent: AgentSummary | null;
  kind: string; // user | npc
  status: string; // idle | walking | talking
  x: number;
  y: number;
  joined_at: string | null;
  last_seen: string | null;
}

interface PresenceSnapshotWire {
  scenario_id: string;
  count: number;
  entries: PresenceEntryWire[];
}

/** Backend presence `status` (idle|walking|talking) → the world's `AgentStatus`. */
function toAgentStatus(status: string | null | undefined): AgentStatus {
  switch (status) {
    case "walking":
      return "traveling";
    case "talking":
      return "talking";
    case "idle":
    default:
      return "idle";
  }
}

/** Normalize a wire `PresenceEntry` into the UI-facing {@link PresenceTwin}. */
function entryToTwin(entry: PresenceEntryWire): PresenceTwin {
  const agent: AgentSummary = entry.agent ?? {
    id: entry.agent_id,
    name: entry.agent_id.slice(0, 6),
    avatar: null,
    profile_tags: [],
  };
  return {
    agent_id: entry.agent_id,
    agent,
    status: toAgentStatus(entry.status),
    trip_id: null,
    encounter_id: null,
    conversation_id: null,
    is_self: false,
    entered_at: entry.joined_at ?? new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* SSE event payloads + client (mirrors lib/sse.ts; presence channel §4.3).    */
/* -------------------------------------------------------------------------- */

export interface PresenceMove {
  agent_id: string;
  x: number;
  y: number;
  status: AgentStatus;
}

export interface PresenceEncounterStarted {
  scenario_id: string;
  conversation_id: string | null;
  agent_ids: string[];
}

export interface PresenceStreamHandlers {
  token?: string;
  /** Seed snapshot the server may emit on connect (`presence-snapshot`). */
  onSnapshot?: (present: PresenceTwin[]) => void;
  onEnter?: (twin: PresenceTwin) => void;
  onMove?: (move: PresenceMove) => void;
  onLeave?: (agentId: string) => void;
  onEncounterStarted?: (e: PresenceEncounterStarted) => void;
  onError?: (e: Event) => void;
}

export interface PresenceStream {
  close: () => void;
}

export function getScenarioPresence(scenarioId: string): Promise<PresenceSnapshot> {
  return apiFetch<PresenceSnapshotWire>(`/api/scenarios/${scenarioId}/presence`, {
    method: "GET",
    auth: false,
  }).then((wire) => {
    const present = (wire.entries ?? []).map(entryToTwin);
    return {
      scenario_id: wire.scenario_id,
      present,
      // The snapshot carries occupants only; encounters arrive via the
      // `encounter-started` SSE event (the contract has no encounter snapshot).
      encounters: [],
      count: wire.count ?? present.length,
      updated_at: new Date().toISOString(),
    };
  });
}

/** Open the read-only presence SSE stream for a plaza (contract §4.3). */
export function openScenarioStream(scenarioId: string, handlers: PresenceStreamHandlers = {}): PresenceStream {
  const url = new URL(`${API_BASE_URL}/api/scenarios/${scenarioId}/stream`, window.location.origin);
  if (handlers.token) url.searchParams.set("token", handlers.token);

  const source = new EventSource(url.toString());
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    source.close();
  };
  const parse = <T>(event: MessageEvent): T | null => {
    try {
      return JSON.parse(event.data) as T;
    } catch {
      return null;
    }
  };

  source.addEventListener("presence-snapshot", (e) => {
    const data = parse<PresenceSnapshotWire>(e as MessageEvent);
    if (data) handlers.onSnapshot?.((data.entries ?? []).map(entryToTwin));
  });
  source.addEventListener("presence-enter", (e) => {
    const data = parse<{ scenario_id: string; entry: PresenceEntryWire }>(e as MessageEvent);
    if (data?.entry) handlers.onEnter?.(entryToTwin(data.entry));
  });
  source.addEventListener("presence-move", (e) => {
    const data = parse<{ agent_id: string; x: number; y: number; status: string }>(e as MessageEvent);
    if (data)
      handlers.onMove?.({ agent_id: data.agent_id, x: data.x, y: data.y, status: toAgentStatus(data.status) });
  });
  source.addEventListener("presence-leave", (e) => {
    const data = parse<{ agent_id: string }>(e as MessageEvent);
    if (data) handlers.onLeave?.(data.agent_id);
  });
  source.addEventListener("encounter-started", (e) => {
    const data = parse<PresenceEncounterStarted>(e as MessageEvent);
    if (data) handlers.onEncounterStarted?.(data);
  });
  // `ping` keepalives + unknown events are ignored.
  source.onerror = (err) => handlers.onError?.(err);

  return { close };
}

/* -------------------------------------------------------------------------- */
/* Typed mock — a believable, contract-shaped plaza without a backend.         */
/* -------------------------------------------------------------------------- */

const PLAZA_STATUSES: AgentStatus[] = ["thinking", "meeting", "talking", "traveling"];

function nowISO(): string {
  return new Date().toISOString();
}

function toSummary(a: { id: string; name: string; avatar: string | null; profile_tags: string[] }): AgentSummary {
  return { id: a.id, name: a.name, avatar: a.avatar ?? pickAvatar(a.name), profile_tags: a.profile_tags ?? [] };
}

/** A deterministic-but-lively present roster for a plaza, drawn from the mock agents. */
export function mockPresenceSnapshot(scenarioId: string): PresenceSnapshot {
  const all = mockStore.listAgents({ limit: 12 }).items.map(toSummary);
  if (all.length === 0) {
    return { scenario_id: scenarioId, present: [], encounters: [], count: 0, updated_at: nowISO() };
  }
  // Rotate a stable window of the roster by scenario so different plazas differ.
  const start = hashIndex(scenarioId, all.length);
  const size = Math.min(all.length, 4 + (hashIndex(scenarioId + "n", 3)));
  const roster: AgentSummary[] = [];
  for (let i = 0; i < size; i++) roster.push(all[(start + i) % all.length]!);

  const present: PresenceTwin[] = roster.map((agent, i) => ({
    agent_id: agent.id,
    agent,
    status: PLAZA_STATUSES[i % PLAZA_STATUSES.length]!,
    trip_id: null,
    encounter_id: null,
    conversation_id: null,
    is_self: false,
    entered_at: nowISO(),
  }));

  const encounters: PlazaEncounter[] = [];
  if (present.length >= 2) {
    const encId = `enc-${scenarioId}-0`;
    const a = present[0]!;
    const b = present[1]!;
    a.status = "talking";
    b.status = "talking";
    a.encounter_id = encId;
    b.encounter_id = encId;
    encounters.push({
      id: encId,
      scenario_id: scenarioId,
      conversation_id: null,
      status: "running",
      participants: [a.agent, b.agent],
      started_at: nowISO(),
    });
  }

  return { scenario_id: scenarioId, present, encounters, count: present.length, updated_at: nowISO() };
}

/* -------------------------------------------------------------------------- */
/* Hooks — live request first, typed mock fallback (flips demo mode).          */
/* -------------------------------------------------------------------------- */

async function orMock<T>(promise: Promise<T>, fallback: () => T): Promise<T> {
  try {
    return await promise;
  } catch {
    useDemoStore.getState().markDemo();
    return fallback();
  }
}

export const presenceKeys = {
  snapshot: (id: string) => ["presence", id] as const,
};

/** Snapshot of who's in a plaza now — real endpoint first, typed-mock fallback. */
export function useScenarioPresence(scenarioId: string | undefined) {
  return useQuery<PresenceSnapshot>({
    queryKey: presenceKeys.snapshot(scenarioId ?? ""),
    enabled: !!scenarioId,
    queryFn: () => orMock(getScenarioPresence(scenarioId!), () => mockPresenceSnapshot(scenarioId!)),
    // Snapshot poll baseline; SSE layers live deltas on top for real plazas.
    refetchInterval: 15_000,
  });
}

export interface LivePresence {
  present: PresenceTwin[];
  encounters: PlazaEncounter[];
  count: number;
  loading: boolean;
}

export interface PlazaPresenceOptions {
  /** Set false to freeze deltas (reduced motion). */
  enabled?: boolean;
  /** The caller's own twin to overlay (from their active trip), if here. */
  selfTwin?: PresenceTwin | null;
}

/**
 * Drive a plaza's live presence. Seeds from the snapshot, then applies SSE
 * presence-snapshot/enter/move/leave + encounter-started deltas for a **real**
 * plaza, or a gentle client-side simulator for a **mock** plaza (so it feels
 * alive). The caller's own twin can be overlaid via `selfTwin`. Reduced motion
 * freezes on the snapshot.
 */
export function usePlazaPresence(scenarioId: string | undefined, opts: PlazaPresenceOptions = {}): LivePresence {
  const { enabled = true, selfTwin = null } = opts;
  const demo = useDemoMode();
  const snapshot = useScenarioPresence(scenarioId);

  const [present, setPresent] = useState<PresenceTwin[]>([]);
  const [encounters, setEncounters] = useState<PlazaEncounter[]>([]);

  // Keep a ref to the live roster so an `encounter-started` event (which carries
  // only agent_ids) can resolve participant summaries without a stale closure.
  const presentRef = useRef<PresenceTwin[]>([]);
  presentRef.current = present;

  // Seed (and re-seed) from the snapshot whenever it changes.
  useEffect(() => {
    if (!snapshot.data) return;
    setPresent(snapshot.data.present ?? []);
    setEncounters(snapshot.data.encounters ?? []);
  }, [snapshot.data]);

  const useSse = enabled && !demo && !!scenarioId;
  const useSim = enabled && demo && !!scenarioId;

  // Real plaza: subscribe to the presence SSE deltas (contract §4.3 names).
  useEffect(() => {
    if (!useSse || !scenarioId) return;
    const stream = openScenarioStream(scenarioId, {
      onSnapshot: (twins) => setPresent(twins),
      onEnter: (twin) =>
        setPresent((cur) => (cur.some((p) => p.agent_id === twin.agent_id) ? cur : [...cur, twin])),
      onMove: (m) =>
        setPresent((cur) =>
          cur.map((p) => (p.agent_id === m.agent_id ? { ...p, status: m.status } : p)),
        ),
      onLeave: (agentId) => setPresent((cur) => cur.filter((p) => p.agent_id !== agentId)),
      onEncounterStarted: (e) => {
        const ids = new Set(e.agent_ids);
        const participants = presentRef.current
          .filter((p) => ids.has(p.agent_id))
          .map((p) => p.agent);
        const encId = e.conversation_id ?? `enc-${e.agent_ids.join("-")}`;
        setEncounters((cur) =>
          cur.some((x) => x.id === encId)
            ? cur
            : [
                ...cur,
                {
                  id: encId,
                  scenario_id: e.scenario_id,
                  conversation_id: e.conversation_id,
                  status: "running" as const,
                  participants,
                  started_at: new Date().toISOString(),
                },
              ],
        );
        // Flip the participants to "talking" + tag them with the encounter so the
        // stage links them and TwinFocus can spectate.
        setPresent((cur) =>
          cur.map((p) =>
            ids.has(p.agent_id)
              ? { ...p, status: "talking", encounter_id: encId, conversation_id: e.conversation_id }
              : p,
          ),
        );
      },
    });
    return () => stream.close();
  }, [useSse, scenarioId]);

  // Mock plaza: a gentle simulator rotates statuses + swaps one twin now and then.
  const tick = useRef(0);
  useEffect(() => {
    if (!useSim) return;
    const id = window.setInterval(() => {
      tick.current += 1;
      setPresent((cur) => {
        if (cur.length === 0) return cur;
        const next = cur.map((p) => ({ ...p }));
        // Rotate one twin's status for a little life.
        const i = tick.current % next.length;
        const t = next[i]!;
        if (!t.encounter_id) {
          const order: AgentStatus[] = ["thinking", "traveling", "meeting", "talking"];
          t.status = order[(order.indexOf(t.status) + 1) % order.length]!;
        }
        return next;
      });
    }, 5200);
    return () => window.clearInterval(id);
  }, [useSim]);

  // Overlay the caller's own twin (dedup by agent id).
  const base = present ?? [];
  const merged = selfTwin
    ? [selfTwin, ...base.filter((p) => p.agent_id !== selfTwin.agent_id)]
    : base;

  return {
    present: merged,
    encounters,
    count: merged.length,
    loading: snapshot.isLoading,
  };
}
