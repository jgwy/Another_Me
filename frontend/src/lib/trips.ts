/**
 * Travel-frog journey data layer (refactor plan §6 / §9).
 *
 * This is the typed seam the living-world map renders against. Shapes mirror the
 * **now-real** contract (`docs/api-contract.md` §2/§3.11/§4.2) 1:1:
 *
 *   - a {@link Trip} is one dispatch that the autonomous planner fans out into
 *     **2–4 encounters**; the twin's `agent_status` drives the world-map avatar,
 *   - the journey is rendered live from the journey SSE stream
 *     (`/api/trips/{id}/stream`) via {@link useTripJourney}.
 *
 * Following the project data pattern, every request tries the real endpoint
 * first and falls back to a typed mock (flipping demo mode) so the world stays
 * alive without a backend. For real trips {@link useTripJourney} consumes the
 * SSE journey events; for mock trips it runs a client-side simulator. At
 * integration the only thing to remove is the mock fallback.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, qs } from "./api";
import type { AgentSummary, Page, ScenarioKey } from "./api";
import { useDemoMode, useDemoStore } from "./queries";
import { mockStore, pickAvatar } from "./mocks";
import { MOCK_IDS } from "./mockData";
import { openTripStream } from "./sse";

/* -------------------------------------------------------------------------- */
/* Status unions — mirror contract §2 (Trip).                                  */
/* -------------------------------------------------------------------------- */

/** Lifecycle of the whole trip. */
export type TripStatus =
  | "planning"
  | "traveling"
  | "in_encounter"
  | "returning"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * The twin's live phase — what the world-map avatar (the travel frog) is doing.
 * This is the contract's `agent_status`; it is the single value that drives the
 * frog's animation state.
 */
export type AgentStatus =
  | "idle"
  | "thinking"
  | "departing"
  | "traveling"
  | "meeting"
  | "talking"
  | "returning"
  | "home";

/** Status of a single encounter (one leg of the trip). */
export type TripEncounterStatus = "pending" | "running" | "completed" | "failed" | "skipped";

/**
 * Canonical forward order of the journey — drives the panel stepper + the mock
 * simulator. `idle`/`home` are terminal resting states outside the bar.
 */
export const JOURNEY_SEQUENCE: AgentStatus[] = [
  "thinking",
  "departing",
  "traveling",
  "meeting",
  "talking",
  "returning",
];

/* -------------------------------------------------------------------------- */
/* Objects — mirror contract §2.                                               */
/* -------------------------------------------------------------------------- */

export interface TripStop {
  scenario_id: string | null;
  scenario_key: string | null;
  opponent_agent_id: string | null;
  reasons: string[];
  risks: string[];
}

export interface TripPlan {
  summary: string;
  stops: TripStop[];
}

/** One leg of a trip: the twin meets a single partner in a single scene. */
export interface TripEncounter {
  id: string;
  trip_id: string;
  /** 0-based order within the trip. */
  seq: number;
  scenario_id: string;
  scenario_key: string | null;
  opponent_agent_id: string | null;
  conversation_id: string | null;
  status: TripEncounterStatus;
  /** Explainable matching rationale (borrowed from the codex matcher concept). */
  match_reasons: string[];
  match_risks: string[];
  report_id: string | null;
  /** Lightweight reusable souvenir / takeaway from the encounter (free JSON). */
  postcard: Record<string, unknown> | null;
  opponent: AgentSummary | null;
  created_at: string;
}

/** One dispatch = one travelling twin that fans out into multiple encounters. */
export interface Trip {
  id: string;
  agent_id: string;
  created_by: string;
  task_prompt: string;
  status: TripStatus;
  /** The twin's current phase — drives the world-map avatar's animation. */
  agent_status: AgentStatus;
  plan: TripPlan;
  duration_seconds: number;
  encounters: TripEncounter[];
  summary_report_id: string | null;
  agent: AgentSummary | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TripCreate {
  agent_id: string;
  task_prompt: string;
  /** Optional cap on planned encounters (defaults server-side). */
  max_encounters?: number;
  /** Optional real wall-clock duration of the journey (defaults from env). */
  duration_seconds?: number;
  /** Optional free-text scene hints for the autonomous planner. */
  scenario_hints?: string[];
}

export interface TripListParams {
  status?: TripStatus;
  agent_id?: string;
  limit?: number;
  offset?: number;
}

/** Pull a human-readable line out of a free-JSON postcard. */
export function postcardText(postcard: Record<string, unknown> | null | undefined): string {
  if (!postcard) return "";
  const v = postcard.text ?? postcard.takeaway ?? postcard.summary ?? postcard.body ?? postcard.quote;
  return typeof v === "string" ? v : "";
}

/** Is the trip still unfolding (so the world-map should drive a live journey)? */
export function isActiveTrip(trip: Trip | undefined | null): boolean {
  return (
    !!trip &&
    (trip.status === "planning" ||
      trip.status === "traveling" ||
      trip.status === "in_encounter" ||
      trip.status === "returning")
  );
}

/* -------------------------------------------------------------------------- */
/* Thin API client (contract §3.11). Trips require auth.                       */
/* -------------------------------------------------------------------------- */

export function listTrips(params?: TripListParams): Promise<Page<Trip>> {
  return apiFetch<Page<Trip>>(`/api/trips${qs(params)}`, { method: "GET" });
}

export function getTrip(id: string): Promise<Trip> {
  return apiFetch<Trip>(`/api/trips/${id}`, { method: "GET" });
}

export function getTripEncounters(id: string): Promise<TripEncounter[]> {
  return apiFetch<TripEncounter[]>(`/api/trips/${id}/encounters`, { method: "GET" });
}

export function createTrip(body: TripCreate): Promise<Trip> {
  return apiFetch<Trip>("/api/trips", { method: "POST", body });
}

export function cancelTrip(id: string): Promise<Trip> {
  return apiFetch<Trip>(`/api/trips/${id}/cancel`, { method: "POST" });
}

/* -------------------------------------------------------------------------- */
/* Typed mock store — realistic, contract-shaped trips so the world is         */
/* complete without a backend. Mirrors the `mockStore` pattern in `mocks.ts`.  */
/* -------------------------------------------------------------------------- */

const SCENE_KEYS: ScenarioKey[] = ["exchange", "cafe", "lab", "coding_club"];

const SCENARIO_ID: Record<ScenarioKey, string> = {
  exchange: MOCK_IDS.SC.exchange,
  cafe: MOCK_IDS.SC.cafe,
  lab: MOCK_IDS.SC.lab,
  coding_club: MOCK_IDS.SC.coding_club,
};

const REASONS = [
  "画像里的「增长」与对方的「资本」高度互补",
  "跨行业背景，最可能带来共情视角",
  "技能标签重合度高，适合并肩做项目",
  "价值观相近，但经历迥异，张力恰好",
  "对方近期话题与本次任务强相关",
];

const RISKS_POOL: string[][] = [
  ["双方都偏强势，可能各说各话"],
  ["话题过窄，深度有限"],
  ["节奏不同步，需要破冰"],
  [],
];

const POSTCARDS = [
  "原来增长的尽头是留存——我把这句话带回来了。",
  "我们比距离暗示的更相似。",
  "一个能直接复用的复盘框架。",
  "对方的一句反问，值得我想很久。",
];

function genId(): string {
  return crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

function summarize(agent: {
  id: string;
  name: string;
  avatar: string | null;
  profile_tags: string[];
}): AgentSummary {
  return {
    id: agent.id,
    name: agent.name,
    avatar: agent.avatar ?? pickAvatar(agent.name),
    profile_tags: agent.profile_tags ?? [],
  };
}

function buildEncounter(
  tripId: string,
  seq: number,
  partner: AgentSummary,
  status: TripEncounterStatus,
): TripEncounter {
  const key = SCENE_KEYS[seq % SCENE_KEYS.length]!;
  const completed = status === "completed";
  const running = status === "running";
  return {
    id: genId(),
    trip_id: tripId,
    seq,
    scenario_id: SCENARIO_ID[key],
    scenario_key: key,
    opponent_agent_id: partner.id,
    conversation_id: completed || running ? genId() : null,
    status,
    match_reasons: [REASONS[seq % REASONS.length]!],
    match_risks: RISKS_POOL[seq % RISKS_POOL.length]!,
    report_id: completed ? genId() : null,
    postcard: completed ? { text: POSTCARDS[seq % POSTCARDS.length]!, scene: key } : null,
    opponent: partner,
    created_at: nowISO(),
  };
}

function buildTrip(opts: {
  agent: AgentSummary;
  partners: AgentSummary[];
  task: string;
  intent: string;
  status: TripStatus;
  agentStatus: AgentStatus;
  activeIndex: number;
  encounterCount: number;
}): Trip {
  const id = genId();
  const encounters: TripEncounter[] = [];
  for (let i = 0; i < opts.encounterCount; i++) {
    const partner = opts.partners[i % Math.max(1, opts.partners.length)]!;
    let status: TripEncounterStatus;
    if (opts.status === "completed") status = "completed";
    else if (i < opts.activeIndex) status = "completed";
    else if (i === opts.activeIndex) status = "running";
    else status = "pending";
    encounters.push(buildEncounter(id, i, partner, status));
  }
  const stops: TripStop[] = encounters.map((e) => ({
    scenario_id: e.scenario_id,
    scenario_key: e.scenario_key,
    opponent_agent_id: e.opponent_agent_id,
    reasons: e.match_reasons,
    risks: e.match_risks,
  }));
  return {
    id,
    agent_id: opts.agent.id,
    created_by: mockStore.getPoints().user_id,
    task_prompt: opts.task,
    status: opts.status,
    agent_status: opts.status === "completed" ? "home" : opts.agentStatus,
    plan: { summary: opts.intent, stops },
    duration_seconds: 180,
    encounters,
    summary_report_id: opts.status === "completed" ? genId() : null,
    agent: opts.agent,
    started_at: opts.status === "planning" ? null : nowISO(),
    ended_at: opts.status === "completed" ? nowISO() : null,
    created_at: nowISO(),
    updated_at: nowISO(),
  };
}

function seedTrips(): Trip[] {
  const agents = mockStore.listAgents({ limit: 12 }).items.map(summarize);
  if (agents.length < 2) return [];
  const [a, b, c, d, e] = agents;
  const partnersFor = (skip: AgentSummary) => agents.filter((x) => x.id !== skip.id);

  const trips: Trip[] = [];

  // 1) A trip mid-journey — the headline "living" trip.
  trips.push(
    buildTrip({
      agent: a!,
      partners: partnersFor(a!),
      task: "去聊聊我的增长思路，找人帮我把数字压力测试一遍。",
      intent: "寻找能给出真实反馈的同行",
      status: "in_encounter",
      agentStatus: "talking",
      activeIndex: 1,
      encounterCount: 3,
    }),
  );

  // 2) A trip just setting out (thinking/planning).
  if (b) {
    trips.push(
      buildTrip({
        agent: b,
        partners: partnersFor(b),
        task: "想认识一个和我完全不同行业的人。",
        intent: "跨行业共情",
        status: "planning",
        agentStatus: "thinking",
        activeIndex: 0,
        encounterCount: 2,
      }),
    );
  }

  // 3) A finished trip — encounters carry reports + postcards.
  if (c) {
    trips.push(
      buildTrip({
        agent: c,
        partners: partnersFor(c),
        task: "复盘上一个项目，看看还能怎么优化协作。",
        intent: "项目协作复盘",
        status: "completed",
        agentStatus: "home",
        activeIndex: 2,
        encounterCount: 3,
      }),
    );
  }

  // 4) Another active trip, on the road, to populate the world.
  if (d && e) {
    trips.push(
      buildTrip({
        agent: d,
        partners: partnersFor(d),
        task: "找人聊聊新点子可行性。",
        intent: "点子可行性验证",
        status: "traveling",
        agentStatus: "traveling",
        activeIndex: 0,
        encounterCount: 2,
      }),
    );
  }

  return trips;
}

function createTripStore() {
  let trips: Trip[] | null = null;

  function ensure(): Trip[] {
    if (trips === null) trips = seedTrips();
    return trips;
  }

  return {
    list(params?: TripListParams): Page<Trip> {
      let items = ensure();
      if (params?.status) items = items.filter((t) => t.status === params.status);
      if (params?.agent_id) items = items.filter((t) => t.agent_id === params.agent_id);
      const limit = params?.limit ?? 20;
      const offset = params?.offset ?? 0;
      return { items: items.slice(offset, offset + limit), total: items.length, limit, offset };
    },
    get(id: string): Trip | undefined {
      return ensure().find((t) => t.id === id);
    },
    encounters(id: string): TripEncounter[] {
      return this.get(id)?.encounters ?? [];
    },
    create(input: TripCreate): Trip {
      const all = ensure();
      const agentRaw = mockStore.getAgent(input.agent_id);
      const agent: AgentSummary = agentRaw
        ? summarize(agentRaw)
        : { id: input.agent_id, name: "我的分身", avatar: pickAvatar(input.agent_id), profile_tags: [] };
      const partners = mockStore
        .listAgents({ limit: 12 })
        .items.map(summarize)
        .filter((x) => x.id !== agent.id);
      const trip = buildTrip({
        agent,
        partners: partners.length ? partners : [agent],
        task: input.task_prompt,
        intent: "自治规划中",
        status: "planning",
        agentStatus: "thinking",
        activeIndex: 0,
        encounterCount: Math.min(Math.max(input.max_encounters ?? 3, 2), 4),
      });
      all.unshift(trip);
      return trip;
    },
    cancel(id: string): Trip | undefined {
      const trip = this.get(id);
      if (!trip) return undefined;
      trip.status = "cancelled";
      trip.agent_status = "home";
      trip.ended_at = nowISO();
      trip.updated_at = nowISO();
      return trip;
    },
  };
}

export const tripMockStore = createTripStore();

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

export const tripKeys = {
  all: ["trips"] as const,
  list: (params?: TripListParams) => ["trips", params ?? {}] as const,
  detail: (id: string) => ["trip", id] as const,
};

export function useTrips(params?: TripListParams) {
  return useQuery<Page<Trip>>({
    queryKey: tripKeys.list(params),
    queryFn: () => orMock(listTrips(params), () => tripMockStore.list(params)),
  });
}

export function useTrip(id: string | undefined) {
  return useQuery<Trip | undefined>({
    queryKey: tripKeys.detail(id ?? ""),
    enabled: !!id,
    queryFn: () => orMock(getTrip(id!), () => tripMockStore.get(id!)),
  });
}

/** Convenience: the first still-travelling trip, else the most recent one. */
export function useActiveTrip() {
  const query = useTrips();
  const active = useMemo(
    () => query.data?.items.find((t) => isActiveTrip(t)) ?? query.data?.items[0],
    [query.data],
  );
  return { ...query, trip: active };
}

export function useCreateTrip() {
  const qc = useQueryClient();
  return useMutation<Trip, Error, TripCreate>({
    mutationFn: (input) => orMock(createTrip(input), () => tripMockStore.create(input)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripKeys.all });
    },
  });
}

export function useCancelTrip() {
  const qc = useQueryClient();
  return useMutation<Trip | undefined, Error, string>({
    mutationFn: (id) => orMock(cancelTrip(id), () => tripMockStore.cancel(id)),
    onSuccess: (trip) => {
      qc.invalidateQueries({ queryKey: tripKeys.all });
      if (trip) qc.invalidateQueries({ queryKey: tripKeys.detail(trip.id) });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Live journey driver — SSE for real trips, simulator for mock trips.         */
/* -------------------------------------------------------------------------- */

/** Normalized live view the world map renders (status + which leg + tween). */
export interface JourneyView {
  /** The twin's current phase — drives the frog's animation state. */
  agentStatus: AgentStatus;
  /** Which encounter (0-based seq) is currently active. */
  activeIndex: number;
  /** 0..1 progress within the current status (great for path tweening). */
  progress: number;
  /** The trip's encounters in seq order. */
  encounters: TripEncounter[];
  /** True once the trip has come home / completed. */
  done: boolean;
}

const PER_ENCOUNTER: AgentStatus[] = ["traveling", "meeting", "talking"];

/** Build the flat status timeline for a trip with `n` encounters. */
function buildTimeline(n: number): { status: AgentStatus; index: number }[] {
  const timeline: { status: AgentStatus; index: number }[] = [
    { status: "thinking", index: 0 },
    { status: "departing", index: 0 },
  ];
  for (let i = 0; i < n; i++) {
    for (const s of PER_ENCOUNTER) timeline.push({ status: s, index: i });
  }
  timeline.push({ status: "returning", index: Math.max(0, n - 1) });
  timeline.push({ status: "home", index: Math.max(0, n - 1) });
  return timeline;
}

/** First running encounter, else first pending, else the last leg. */
function deriveActiveIndex(encounters: TripEncounter[]): number {
  const running = encounters.findIndex((e) => e.status === "running");
  if (running >= 0) return running;
  const pending = encounters.findIndex((e) => e.status === "pending");
  if (pending >= 0) return pending;
  return Math.max(0, encounters.length - 1);
}

export interface TripJourneyOptions {
  /** Set false to freeze (e.g. reduced motion). */
  enabled?: boolean;
  /** Seconds spent in each status before advancing (mock simulator only). */
  stepSeconds?: number;
}

/**
 * Drive the world-map avatar for a trip.
 *
 * For a **real** trip (demo mode off), this subscribes to the journey SSE
 * stream (`/api/trips/{id}/stream`) and feeds the live `agent_status` +
 * active encounter straight through; encounter/trip ends refresh the trip query
 * so reports + postcards land. For a **mock** trip (demo fallback) it runs a
 * client-side simulator so the world looks alive. Either way it also produces a
 * smooth 0..1 `progress` so the frog glides along its route at 60fps. Under
 * reduced motion it freezes on the trip's real phase.
 */
export function useTripJourney(trip: Trip | undefined, opts: TripJourneyOptions = {}): JourneyView {
  const { enabled = true, stepSeconds = 3 } = opts;
  const demo = useDemoMode();
  const qc = useQueryClient();
  const encounters = useMemo(
    () => (trip ? [...trip.encounters].sort((a, b) => a.seq - b.seq) : []),
    [trip],
  );
  const n = encounters.length;
  const live = isActiveTrip(trip);
  // Real trips drive from SSE; mock/demo trips drive from the local simulator.
  const useSse = enabled && live && !demo && !!trip;

  const [agentStatus, setAgentStatus] = useState<AgentStatus>(trip?.agent_status ?? "idle");
  const [activeIndex, setActiveIndex] = useState<number>(() => deriveActiveIndex(encounters));
  const [progress, setProgress] = useState(0);

  // Keep seed in sync when the trip object changes (query refetch).
  useEffect(() => {
    setAgentStatus(trip?.agent_status ?? "idle");
    setActiveIndex(deriveActiveIndex(encounters));
  }, [trip?.id, trip?.agent_status, encounters]);

  /* --- Real journey: subscribe to the SSE stream. --- */
  useEffect(() => {
    if (!useSse || !trip) return;
    const stream = openTripStream(trip.id, {
      onAgentStatus: (e) => setAgentStatus(e.agent_status),
      onEncounterStart: (e) => setActiveIndex(e.seq),
      onEncounterEnd: () => {
        // Pull fresh encounters (report + postcard now attached).
        qc.invalidateQueries({ queryKey: tripKeys.detail(trip.id) });
        qc.invalidateQueries({ queryKey: tripKeys.all });
      },
      onTripEnd: () => {
        setAgentStatus("home");
        qc.invalidateQueries({ queryKey: tripKeys.detail(trip.id) });
        qc.invalidateQueries({ queryKey: tripKeys.all });
      },
    });
    return () => stream.close();
  }, [useSse, trip?.id, qc]);

  /* --- Mock journey: cycle the timeline locally. --- */
  const simIndexRef = useRef(0);
  useEffect(() => {
    if (useSse || !enabled || !trip || !live || n === 0) return;
    const timeline = buildTimeline(n);
    let raf = 0;
    const start = performance.now();
    const stepMs = stepSeconds * 1000;
    const totalMs = timeline.length * stepMs;
    const frame = (t: number) => {
      const elapsed = (t - start) % totalMs;
      const slot = Math.min(timeline.length - 1, Math.floor(elapsed / stepMs));
      const cur = timeline[slot]!;
      if (slot !== simIndexRef.current) {
        simIndexRef.current = slot;
        setAgentStatus(cur.status);
        setActiveIndex(cur.index);
      }
      setProgress((elapsed % stepMs) / stepMs);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [useSse, enabled, trip?.id, live, n, stepSeconds]);

  /* --- Smooth progress for real trips (and reduced-motion placement). --- */
  const traveling = agentStatus === "traveling" || agentStatus === "returning";
  useEffect(() => {
    if (!useSse) return;
    if (!enabled) {
      // Reduced motion: place the frog at its destination, no animation.
      setProgress(1);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const rampMs = 3200;
    const frame = (t: number) => {
      const elapsed = t - start;
      if (traveling) {
        setProgress(Math.min(1, elapsed / rampMs));
      } else {
        // Gentle idle oscillation for non-travel states.
        setProgress((Math.sin(elapsed / 900) + 1) / 2);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [useSse, enabled, traveling, agentStatus, activeIndex]);

  // Reduced motion + mock: freeze on the trip's real phase at its destination.
  const frozen = !enabled;
  return {
    agentStatus: frozen ? (trip?.agent_status ?? "idle") : agentStatus,
    activeIndex: frozen ? deriveActiveIndex(encounters) : activeIndex,
    progress: frozen ? 1 : progress,
    encounters,
    done: agentStatus === "home" || trip?.status === "completed",
  };
}

/* -------------------------------------------------------------------------- */
/* Back-compat alias for the previous simulator hook name (island internals).  */
/* -------------------------------------------------------------------------- */

export const useJourneySimulation = useTripJourney;
