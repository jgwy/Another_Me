/**
 * Living-world geometry (refactor plan §9).
 *
 * All coordinates live in the SVG viewBox space ({@link WORLD.width} ×
 * {@link WORLD.height}) so they scale with the responsive, full-bleed canvas
 * and so Motion can animate `x`/`y` on `<motion.g>` as compositor-friendly
 * transforms (60fps, SC1). Nothing here is React — it is pure geometry shared by
 * the static `WorldMap` layer and the live `TravelFrog` layer so the two stacked
 * SVGs align pixel-for-pixel.
 *
 * Colors are referenced as CSS custom-property strings (e.g.
 * `var(--color-scn-cafe)`) so the world consumes the unified design tokens
 * rather than hardcoding hexes — change a token, the world follows.
 */
import type { ScenarioKey } from "../../lib/api";
import type { AgentStatus, TripEncounterStatus } from "../../lib/trips";

export interface Pt {
  x: number;
  y: number;
}

/** Canvas dimensions + the two fixed landmarks every journey pivots around. */
export const WORLD = {
  width: 1200,
  height: 780,
  /** The frog's home — where it thinks, sets out from, and returns to. */
  home: { x: 600, y: 648 } as Pt,
  /** Central plaza/hub every route threads through. */
  plaza: { x: 600, y: 392 } as Pt,
};

export interface BuildingSpec {
  key: ScenarioKey;
  /** Center of the building glyph. */
  pos: Pt;
  /** Center of the meeting area in front of (south of) the building. */
  anchor: Pt;
  /** CSS custom property for this scene's accent — single source of truth. */
  colorVar: string;
  emoji: string;
}

/** How far in front of a building its meeting area sits. */
const ANCHOR_DROP = 92;

function building(key: ScenarioKey, pos: Pt, colorVar: string, emoji: string): BuildingSpec {
  return { key, pos, anchor: { x: pos.x, y: pos.y + ANCHOR_DROP }, colorVar, emoji };
}

/** The four refined scenario districts, each with a distinct scene token. */
export const BUILDINGS: Record<ScenarioKey, BuildingSpec> = {
  exchange: building("exchange", { x: 268, y: 226 }, "var(--color-scn-exchange)", "📈"),
  cafe: building("cafe", { x: 932, y: 226 }, "var(--color-scn-cafe)", "☕"),
  lab: building("lab", { x: 214, y: 472 }, "var(--color-scn-lab)", "🧪"),
  coding_club: building("coding_club", { x: 986, y: 472 }, "var(--color-scn-coding)", "💻"),
};

export const BUILDING_ORDER: ScenarioKey[] = ["exchange", "cafe", "lab", "coding_club"];

/** Narrow a free-form `scenario_key` (contract allows any string) to a building. */
export function isSceneKey(key: string | null | undefined): key is ScenarioKey {
  return key === "exchange" || key === "cafe" || key === "lab" || key === "coding_club";
}

/** Scene accent token for a (possibly unknown) scenario key. */
export function sceneColorVar(key: string | null | undefined): string {
  return isSceneKey(key) ? BUILDINGS[key].colorVar : "var(--color-faint)";
}

/** `agent_status` → its design token (CSS var). Drives the frog aura + labels. */
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

/** Where the frog stands at a building (right of the meeting area). */
export function frogSpot(key: ScenarioKey): Pt {
  const a = BUILDINGS[key].anchor;
  return { x: a.x + 30, y: a.y };
}

/** Where the partner stands (left of the meeting area, facing the frog). */
export function partnerSpot(key: ScenarioKey): Pt {
  const a = BUILDINGS[key].anchor;
  return { x: a.x - 30, y: a.y };
}

/* -------------------------------------------------------------------------- */
/* Path helpers — pure functions, used to both draw routes and tween the frog. */
/* -------------------------------------------------------------------------- */

function distance(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** A smooth quadratic path string through the points (rounded interior joints). */
export function roundedPath(pts: Pt[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0]!.x} ${pts[0]!.y}`;
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const cur = pts[i]!;
    const nxt = pts[i + 1]!;
    const midX = (cur.x + nxt.x) / 2;
    const midY = (cur.y + nxt.y) / 2;
    d += ` Q ${cur.x} ${cur.y} ${midX} ${midY}`;
  }
  const last = pts[pts.length - 1]!;
  d += ` L ${last.x} ${last.y}`;
  return d;
}

/** Point at normalized arc-length `t` (0..1) along a polyline — constant speed. */
export function lerpAlongPath(pts: Pt[], t: number): Pt {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0]!;
  const tt = clamp01(t);
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = distance(pts[i - 1]!, pts[i]!);
    segs.push(d);
    total += d;
  }
  if (total === 0) return pts[0]!;
  let target = tt * total;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    if (target <= seg || i === segs.length - 1) {
      const f = seg === 0 ? 0 : target / seg;
      const a = pts[i]!;
      const b = pts[i + 1]!;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    target -= seg;
  }
  return pts[pts.length - 1]!;
}

/** Decorative guide-map route home → plaza → a building's meeting area. */
export function routePath(key: ScenarioKey): string {
  return roundedPath([WORLD.home, WORLD.plaza, BUILDINGS[key].anchor]);
}

/** Relationship line home → a met partner (drawn only for done encounters). */
export function relationshipPath(key: ScenarioKey): string {
  return roundedPath([WORLD.home, WORLD.plaza, partnerSpot(key)]);
}

/* -------------------------------------------------------------------------- */
/* Frog placement — maps a journey tick to a world position + facing.          */
/* -------------------------------------------------------------------------- */

export interface FrogPlacement {
  x: number;
  y: number;
  /** True when the frog should mirror to face left (toward a partner / west). */
  faceLeft: boolean;
}

/**
 * Resolve where the frog is for a given journey tick. `keys` is the ordered
 * list of each encounter's scene, so the frog walks home → b0 → b1 → … → home,
 * threading the plaza between legs. Pure + cheap, so it can run every frame.
 */
export function placeFrog(
  keys: ScenarioKey[],
  status: AgentStatus,
  encounterIndex: number,
  progress: number,
): FrogPlacement {
  const { home, plaza } = WORLD;
  const n = keys.length;
  if (n === 0) return { x: home.x, y: home.y, faceLeft: false };

  const idx = encounterIndex < 0 ? 0 : encounterIndex >= n ? n - 1 : encounterIndex;

  const legInto = (i: number): Pt[] => {
    const from = i === 0 ? home : frogSpot(keys[i - 1]!);
    return [from, plaza, frogSpot(keys[i]!)];
  };
  const returnLeg = (): Pt[] => [frogSpot(keys[n - 1]!), plaza, home];

  const traveling = (path: Pt[]): FrogPlacement => {
    const here = lerpAlongPath(path, progress);
    const ahead = lerpAlongPath(path, Math.min(1, progress + 0.02));
    return { x: here.x, y: here.y, faceLeft: ahead.x < here.x - 0.5 };
  };

  switch (status) {
    case "idle":
    case "thinking":
    case "home":
      return { x: home.x, y: home.y, faceLeft: false };
    case "departing": {
      const here = lerpAlongPath(legInto(idx), 0.14 * progress);
      return { x: here.x, y: here.y, faceLeft: false };
    }
    case "traveling":
      return traveling(legInto(idx));
    case "meeting":
    case "talking": {
      const spot = frogSpot(keys[idx]!);
      return { x: spot.x, y: spot.y, faceLeft: true };
    }
    case "returning":
      return traveling(returnLeg());
    default:
      return { x: home.x, y: home.y, faceLeft: false };
  }
}
