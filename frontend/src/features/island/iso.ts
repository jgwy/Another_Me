/**
 * Isometric (2.5D) world geometry — the projection + dynamic layout that turns
 * the **live scenario list** into a little 原神/Genshin-style world (refactor
 * plan §7). Pure math + data, no React, so it is shared by the static world
 * layer, the travelling-twin layer, and the plaza stage, and so Motion can
 * animate `transform` on the projected screen points (compositor-only, 60fps).
 *
 * Projection is a classic 2:1 dimetric grid: a tile `(gx, gy)` maps to screen
 *   sx = originX + (gx - gy) * (TILE_W / 2)
 *   sy = originY + (gx + gy) * (TILE_H / 2) − z          (z lifts buildings up)
 * and **paint order = depth = gx + gy** (back-to-front), which is how buildings,
 * shadows, and little-characters (小人) occlude correctly without a z-buffer.
 *
 * Buildings render from `scenario.meta` (coords/category/visual) — there is no
 * hardcoded set; N scenarios ⇒ N buildings. Coordinates default to `meta.x/y`
 * (0..100), so a user-created scenario lands on the map the moment it exists.
 */
import type { Scenario } from "../../lib/api";
import { hashIndex } from "../../lib/format";
import { SCENE_COLOR, SCENE_PALETTE, isSceneKey } from "./worldLayout";

export interface Pt {
  x: number;
  y: number;
}

export interface GridPos {
  gx: number;
  gy: number;
}

/* -------------------------------------------------------------------------- */
/* Projection constants                                                        */
/* -------------------------------------------------------------------------- */

/** Tile footprint in screen px (2:1 dimetric — width is twice the height). */
export const TILE_W = 132;
export const TILE_H = 66;

/** Shared SVG viewBox for every iso surface (world + plaza), so layers align. */
export const ISO_VIEW = { width: 1200, height: 860 } as const;

const ORIGIN: Pt = { x: ISO_VIEW.width / 2, y: 336 };

/** Grid → screen. `z` lifts a point up the screen (building height, hops). */
export function projectIso(g: GridPos, z = 0): Pt {
  return {
    x: ORIGIN.x + (g.gx - g.gy) * (TILE_W / 2),
    y: ORIGIN.y + (g.gx + g.gy) * (TILE_H / 2) - z,
  };
}

/** Painter's-order depth for a tile (greater = nearer the camera = on top). */
export function depthOf(g: GridPos): number {
  return g.gx + g.gy;
}

/* -------------------------------------------------------------------------- */
/* Isometric prism faces (a pseudo-3D building / pad)                          */
/* -------------------------------------------------------------------------- */

export interface PrismFaces {
  /** Roof diamond (top), front-right wall (SE), front-left wall (SW). */
  top: Pt[];
  right: Pt[];
  left: Pt[];
}

/**
 * The three camera-facing faces of an iso box standing on ground center `base`,
 * with a diamond footprint of half-extents (`halfW`,`halfD`) rising `height` px.
 */
export function prismFaces(base: Pt, halfW: number, halfD: number, height: number): PrismFaces {
  const gN = { x: base.x, y: base.y - halfD };
  const gE = { x: base.x + halfW, y: base.y };
  const gS = { x: base.x, y: base.y + halfD };
  const gW = { x: base.x - halfW, y: base.y };
  const tN = { x: gN.x, y: gN.y - height };
  const tE = { x: gE.x, y: gE.y - height };
  const tS = { x: gS.x, y: gS.y - height };
  const tW = { x: gW.x, y: gW.y - height };
  return {
    top: [tN, tE, tS, tW],
    right: [gS, gE, tE, tS],
    left: [gW, gS, tS, tW],
  };
}

/** A flat iso diamond (ground pad / plaza floor) of half-extents around `base`. */
export function diamond(base: Pt, halfW: number, halfD: number): Pt[] {
  return [
    { x: base.x, y: base.y - halfD },
    { x: base.x + halfW, y: base.y },
    { x: base.x, y: base.y + halfD },
    { x: base.x - halfW, y: base.y },
  ];
}

/** Serialize points to an SVG `points`/path-friendly string. */
export function polyStr(pts: Pt[]): string {
  return pts.map((p) => `${round(p.x)},${round(p.y)}`).join(" ");
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/* -------------------------------------------------------------------------- */
/* Dynamic scenario → visual resolution                                        */
/* -------------------------------------------------------------------------- */

/** Read an extra `meta` field the backend may add (category/visual) safely. */
function metaField(scenario: Scenario, key: string): string | undefined {
  const meta = scenario.meta as unknown as Record<string, unknown> | null;
  const v = meta?.[key];
  return typeof v === "string" && v.trim() ? v : undefined;
}

function metaNumber(scenario: Scenario, key: string): number | undefined {
  const meta = scenario.meta as unknown as Record<string, unknown> | null;
  const v = meta?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Curated emoji per scene category / kind, with a fallback pool by hash. */
const CATEGORY_EMOJI: Record<string, string> = {
  exchange: "📈",
  cafe: "☕",
  lab: "🧪",
  coding_club: "💻",
  business: "📈",
  empathy: "☕",
  generic: "🏛️",
  bookclub: "📚",
  gym: "🏋️",
  livehouse: "🎸",
  dating: "💞",
  esports: "🎮",
  hospital: "🏥",
  law: "⚖️",
  studio: "🎨",
  observatory: "🔭",
  market: "🏮",
};

const EMOJI_POOL = ["🏛️", "🏠", "🏢", "🏬", "🏯", "⛩️", "🏟️", "🎪", "🛖", "🗼"];

/** Accent token (CSS var name) for a scenario — meta/category first, then key, then palette. */
export function scenarioColor(scenario: Scenario, index: number): string {
  const category = metaField(scenario, "category") ?? metaField(scenario, "color_key");
  if (category && isSceneKey(category)) return SCENE_COLOR[category];
  if (isSceneKey(scenario.key)) return SCENE_COLOR[scenario.key];
  return SCENE_PALETTE[index % SCENE_PALETTE.length]!;
}

/** Building emoji glyph for a scenario — explicit meta first, then category/kind, then pool. */
export function scenarioEmoji(scenario: Scenario, index: number): string {
  const explicit = metaField(scenario, "emoji") ?? metaField(scenario, "icon");
  if (explicit) return explicit;
  const category = metaField(scenario, "category");
  if (category && CATEGORY_EMOJI[category]) return CATEGORY_EMOJI[category]!;
  if (CATEGORY_EMOJI[scenario.key]) return CATEGORY_EMOJI[scenario.key]!;
  if (CATEGORY_EMOJI[scenario.kind]) return CATEGORY_EMOJI[scenario.kind]!;
  return EMOJI_POOL[hashIndex(scenario.id || scenario.key || String(index), EMOJI_POOL.length)]!;
}

/* -------------------------------------------------------------------------- */
/* World layout — N scenarios → placed iso buildings                           */
/* -------------------------------------------------------------------------- */

export interface IsoBuildingPlacement {
  scenario: Scenario;
  grid: GridPos;
  /** Ground center in screen space (where the building stands). */
  base: Pt;
  /** Where a partner / the traveler stands in front of (south of) the building. */
  anchor: Pt;
  color: string;
  emoji: string;
  depth: number;
}

export interface IsoLayout {
  width: number;
  height: number;
  home: Pt;
  homeGrid: GridPos;
  plaza: Pt;
  plazaGrid: GridPos;
  /** Buildings sorted back-to-front (ascending depth) for correct painting. */
  buildings: IsoBuildingPlacement[];
  byScenarioId: Map<string, IsoBuildingPlacement>;
  /** Half-extent of the grid in tiles (the ground diamond radius). */
  radius: number;
}

/** How far in front of a building (south, +gy/+gx) its meeting anchor sits. */
const ANCHOR_DROP = 58;

/**
 * Lay the live scenarios onto the iso grid. `meta.x/y` (0..100) map to a centered
 * grid in `[-R, R]`; the plaza is the center and home is the near (front) tile.
 * Buildings are returned sorted back-to-front so the caller paints them in order.
 */
export function computeIsoLayout(scenarios: Scenario[]): IsoLayout {
  const radius = scenarios.length > 9 ? 3.4 : 2.6;
  const plazaGrid: GridPos = { gx: 0, gy: 0 };
  const homeGrid: GridPos = { gx: radius + 0.7, gy: radius + 0.7 };

  const toGrid = (x: number, y: number): GridPos => ({
    gx: ((clamp01(x / 100) - 0.5) * 2) * radius,
    gy: ((clamp01(y / 100) - 0.5) * 2) * radius,
  });

  const buildings: IsoBuildingPlacement[] = scenarios.map((scenario, i) => {
    const mx = metaNumber(scenario, "x");
    const my = metaNumber(scenario, "y");
    // Fall back to an even ring when meta has no coords, so the world never piles up.
    const fallback = ringPoint(i, scenarios.length, radius);
    const grid = mx != null && my != null ? toGrid(mx, my) : fallback;
    const base = projectIso(grid);
    const anchor = { x: base.x, y: base.y + ANCHOR_DROP };
    return {
      scenario,
      grid,
      base,
      anchor,
      color: scenarioColor(scenario, i),
      emoji: scenarioEmoji(scenario, i),
      depth: depthOf(grid),
    };
  });

  buildings.sort((a, b) => a.depth - b.depth);
  const byScenarioId = new Map(buildings.map((b) => [b.scenario.id, b]));

  return {
    width: ISO_VIEW.width,
    height: ISO_VIEW.height,
    home: projectIso(homeGrid),
    homeGrid,
    plaza: projectIso(plazaGrid),
    plazaGrid,
    buildings,
    byScenarioId,
    radius,
  };
}

/** Evenly spaced grid point on a ring of the given tile-radius (layout fallback). */
function ringPoint(i: number, n: number, radius: number): GridPos {
  const angle = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 4;
  return { gx: Math.cos(angle) * radius, gy: Math.sin(angle) * radius };
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/* -------------------------------------------------------------------------- */
/* Path helpers — draw routes + tween the travelling twin along them.          */
/* -------------------------------------------------------------------------- */

function distance(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** A smooth quadratic path string through the points (rounded interior joints). */
export function roundedPath(pts: Pt[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${round(pts[0]!.x)} ${round(pts[0]!.y)}`;
  let d = `M ${round(pts[0]!.x)} ${round(pts[0]!.y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const cur = pts[i]!;
    const nxt = pts[i + 1]!;
    d += ` Q ${round(cur.x)} ${round(cur.y)} ${round((cur.x + nxt.x) / 2)} ${round((cur.y + nxt.y) / 2)}`;
  }
  const last = pts[pts.length - 1]!;
  d += ` L ${round(last.x)} ${round(last.y)}`;
  return d;
}

/** Point at normalized arc-length `t` (0..1) along a polyline — constant speed. */
export function lerpAlongPath(pts: Pt[], t: number): Pt {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0]!;
  const tt = t < 0 ? 0 : t > 1 ? 1 : t;
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

export interface TravelerPlacement {
  x: number;
  y: number;
  /** True when the twin should mirror to face left (toward a partner / west). */
  faceLeft: boolean;
  /** True while actively walking a route (drives the walk cycle). */
  walking: boolean;
}

/**
 * Resolve where the travelling twin is for a journey tick, in screen space.
 * `anchors` are each encounter's building anchor (already projected); the twin
 * walks home → a0 → a1 → … → home, always threading the plaza between legs.
 */
export function placeTraveler(
  route: { home: Pt; plaza: Pt; anchors: Pt[] },
  status: string,
  encounterIndex: number,
  progress: number,
): TravelerPlacement {
  const { home, plaza, anchors } = route;
  const n = anchors.length;
  if (n === 0) return { x: home.x, y: home.y, faceLeft: false, walking: false };

  const idx = encounterIndex < 0 ? 0 : encounterIndex >= n ? n - 1 : encounterIndex;
  const spot = (i: number): Pt => anchors[i]!;
  const legInto = (i: number): Pt[] => [i === 0 ? home : spot(i - 1), plaza, spot(i)];
  const returnLeg = (): Pt[] => [spot(n - 1), plaza, home];

  const walk = (path: Pt[]): TravelerPlacement => {
    const here = lerpAlongPath(path, progress);
    const ahead = lerpAlongPath(path, Math.min(1, progress + 0.02));
    return { x: here.x, y: here.y, faceLeft: ahead.x < here.x - 0.5, walking: true };
  };

  switch (status) {
    case "idle":
    case "thinking":
    case "home":
      return { x: home.x, y: home.y, faceLeft: false, walking: false };
    case "departing": {
      const here = lerpAlongPath(legInto(idx), 0.16 * progress);
      return { x: here.x, y: here.y, faceLeft: false, walking: true };
    }
    case "traveling":
      return walk(legInto(idx));
    case "meeting":
    case "talking": {
      const s = spot(idx);
      return { x: s.x, y: s.y, faceLeft: true, walking: false };
    }
    case "returning":
      return walk(returnLeg());
    default:
      return { x: home.x, y: home.y, faceLeft: false, walking: false };
  }
}
