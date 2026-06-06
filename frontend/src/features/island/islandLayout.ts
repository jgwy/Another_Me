/**
 * Island geometry. All coordinates live in the SVG viewBox space
 * (1000 × 640) so they scale with the responsive map and so Motion can animate
 * `x`/`y` on `<motion.g>` as compositor-friendly transforms (60fps, SC1).
 */
import type { ScenarioKey } from "../../lib/api";

export interface Pt {
  x: number;
  y: number;
}

export const ISLAND = {
  width: 1000,
  height: 640,
  /** Dock where twins step onto the island. */
  entrance: { x: 500, y: 602 } as Pt,
  plaza: { x: 500, y: 332 } as Pt,
};

export interface BuildingSpec {
  key: ScenarioKey;
  /** Center of the building glyph. */
  pos: Pt;
  /** Table the twins gather around (click target). */
  table: Pt;
  /** Two seats flanking the table; index 0 = seat 1, index 1 = seat 2. */
  seats: [Pt, Pt];
  /** Walk waypoints from the dock to the table approach (seat appended later). */
  approach: Pt[];
  /** Building accent (hex). */
  color: string;
  emoji: string;
  zh: string;
}

export const BUILDINGS: Record<ScenarioKey, BuildingSpec> = {
  exchange: {
    key: "exchange",
    pos: { x: 256, y: 214 },
    table: { x: 256, y: 270 },
    seats: [
      { x: 217, y: 270 },
      { x: 295, y: 270 },
    ],
    approach: [
      ISLAND.entrance,
      { x: 470, y: 548 },
      { x: 372, y: 466 },
      { x: 300, y: 378 },
      { x: 262, y: 314 },
    ],
    color: "#7c5cff",
    emoji: "📈",
    zh: "交易所",
  },
  cafe: {
    key: "cafe",
    pos: { x: 744, y: 204 },
    table: { x: 744, y: 260 },
    seats: [
      { x: 705, y: 260 },
      { x: 783, y: 260 },
    ],
    approach: [
      ISLAND.entrance,
      { x: 530, y: 548 },
      { x: 628, y: 466 },
      { x: 700, y: 378 },
      { x: 738, y: 304 },
    ],
    color: "#2dd4a7",
    emoji: "☕",
    zh: "咖啡馆",
  },
  lab: {
    key: "lab",
    pos: { x: 268, y: 450 },
    table: { x: 268, y: 504 },
    seats: [
      { x: 229, y: 504 },
      { x: 307, y: 504 },
    ],
    approach: [
      ISLAND.entrance,
      { x: 432, y: 566 },
      { x: 352, y: 548 },
      { x: 300, y: 532 },
      { x: 270, y: 548 },
    ],
    color: "#fbbf55",
    emoji: "🧪",
    zh: "化学实验室",
  },
  coding_club: {
    key: "coding_club",
    pos: { x: 742, y: 450 },
    table: { x: 742, y: 504 },
    seats: [
      { x: 703, y: 504 },
      { x: 781, y: 504 },
    ],
    approach: [
      ISLAND.entrance,
      { x: 568, y: 566 },
      { x: 648, y: 548 },
      { x: 706, y: 532 },
      { x: 742, y: 548 },
    ],
    color: "#38bdf8",
    emoji: "💻",
    zh: "Coding Club",
  },
};

export const BUILDING_ORDER: ScenarioKey[] = ["exchange", "cafe", "lab", "coding_club"];

/** Full walk path for a seat: dock → approach → the chosen seat. */
export function walkPath(key: ScenarioKey, seat: number): Pt[] {
  const b = BUILDINGS[key];
  const seatPt = seat === 2 ? b.seats[1] : b.seats[0];
  return [...b.approach, seatPt];
}

/** A rounded SVG path string through the points (smooth interior joints). */
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

/** Normalized cumulative-distance stops so keyframed walks move at ~constant speed. */
export function keyframeTimes(pts: Pt[]): number[] {
  if (pts.length < 2) return [0, 1];
  const dist: number[] = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    dist.push(total);
  }
  return dist.map((d) => (total === 0 ? 0 : d / total));
}
