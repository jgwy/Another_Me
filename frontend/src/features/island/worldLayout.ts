/**
 * Living-world design tokens (refactor plan §7 — 2.5D world).
 *
 * The geometry now lives in {@link ./iso} (the isometric projection + dynamic
 * scenario layout). This module is the small, stable **token surface** the world
 * and the journey panels share: every color is a CSS custom property string
 * (e.g. `var(--color-scn-cafe)`) so the world consumes the unified design tokens
 * by name — a sibling agent can re-skin `styles/index.css` and the world follows
 * without a code change.
 */
import type { ScenarioKey } from "../../lib/api";
import type { AgentStatus, TripEncounterStatus } from "../../lib/trips";

/** Accent token per known scenario key — the single source of truth for hue. */
export const SCENE_COLOR: Record<ScenarioKey, string> = {
  exchange: "var(--color-scn-exchange)",
  cafe: "var(--color-scn-cafe)",
  lab: "var(--color-scn-lab)",
  coding_club: "var(--color-scn-coding)",
};

/**
 * Rotating accent palette for the now-**dynamic** set of scenarios (the world
 * renders N buildings from the live scenario list, not a hardcoded 4). All names
 * resolve against `styles/index.css` tokens.
 */
export const SCENE_PALETTE: string[] = [
  "var(--color-scn-exchange)",
  "var(--color-scn-cafe)",
  "var(--color-scn-lab)",
  "var(--color-scn-coding)",
  "var(--color-brand)",
  "var(--color-accent)",
];

/** Narrow a free-form `scenario_key` (contract allows any string) to a key. */
export function isSceneKey(key: string | null | undefined): key is ScenarioKey {
  return key === "exchange" || key === "cafe" || key === "lab" || key === "coding_club";
}

/** Scene accent token for a (possibly unknown) scenario key. */
export function sceneColorVar(key: string | null | undefined): string {
  return isSceneKey(key) ? SCENE_COLOR[key] : "var(--color-faint)";
}

/** `agent_status` → its design token (CSS var). Drives the traveler aura + labels. */
export const JOURNEY_COLOR: Record<AgentStatus, string> = {
  idle: "var(--color-faint)",
  thinking: "var(--color-journey-thinking)",
  departing: "var(--color-journey-departing)",
  traveling: "var(--color-journey-on-road)",
  meeting: "var(--color-journey-meeting)",
  talking: "var(--color-journey-talking)",
  returning: "var(--color-journey-returned)",
  home: "var(--color-accent)",
};

/** Encounter status → its design token (CSS var), for panels + partner tokens. */
export const ENCOUNTER_COLOR: Record<TripEncounterStatus, string> = {
  pending: "var(--color-faint)",
  running: "var(--color-journey-talking)",
  completed: "var(--color-journey-returned)",
  failed: "var(--color-danger)",
  skipped: "var(--color-faint)",
};
