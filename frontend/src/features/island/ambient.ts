/**
 * Ambient life for the 2.5D world — resident twins (小人) gently milling about
 * the meadow between districts, and soft motes drifting overhead. Pure, seeded
 * data so the world looks inhabited without a backend. Resident loops are in the
 * iso **grid** space ({@link GridPos}) and projected at render time, so they sit
 * naturally among the dynamically-placed buildings; the motes are in screen
 * space. Everything animates transform/opacity only (60fps, SC1).
 */
import { SCENE_PALETTE } from "./worldLayout";
import type { GridPos } from "./iso";

export interface ResidentSpec {
  id: string;
  emoji: string;
  /** CSS custom-property accent (consumes the design tokens). */
  colorVar: string;
  /** Closed-ish loop of grid waypoints the resident wanders. */
  loop: GridPos[];
  /** Seconds for one full loop. */
  dur: number;
  /** Start offset so residents desync. */
  delay: number;
  /** Relative size of the little character. */
  scale: number;
}

/** A small diamond loop of grid waypoints around a base tile. */
function loopAround(gx: number, gy: number, r = 0.5): GridPos[] {
  return [
    { gx: gx, gy: gy - r },
    { gx: gx + r, gy: gy },
    { gx: gx, gy: gy + r },
    { gx: gx - r, gy: gy },
  ];
}

const RESIDENT_SEED: { gx: number; gy: number; emoji: string; dur: number; delay: number; scale: number }[] = [
  { gx: 0, gy: -1.9, emoji: "🚶", dur: 26, delay: 0, scale: 0.9 },
  { gx: -1.9, gy: -0.2, emoji: "🦊", dur: 30, delay: 2.4, scale: 0.92 },
  { gx: 1.9, gy: -0.2, emoji: "🧑‍🎨", dur: 28, delay: 1.1, scale: 0.88 },
  { gx: -1.1, gy: 1.2, emoji: "🐢", dur: 31, delay: 3.2, scale: 0.86 },
  { gx: 1.1, gy: 1.2, emoji: "🦉", dur: 27, delay: 1.8, scale: 0.9 },
  { gx: -2.4, gy: -2.2, emoji: "🐼", dur: 33, delay: 0.6, scale: 0.84 },
  { gx: 2.4, gy: -2.2, emoji: "🚶‍♀️", dur: 32, delay: 2.9, scale: 0.86 },
  { gx: 0.2, gy: 2.3, emoji: "🦌", dur: 29, delay: 1.4, scale: 0.88 },
];

export const RESIDENTS: ResidentSpec[] = RESIDENT_SEED.map((r, i) => ({
  id: `r${i + 1}`,
  emoji: r.emoji,
  colorVar: SCENE_PALETTE[i % SCENE_PALETTE.length]!,
  loop: loopAround(r.gx, r.gy, 0.5 + (i % 3) * 0.12),
  dur: r.dur,
  delay: r.delay,
  scale: r.scale,
}));

export interface FireflySpec {
  x: number;
  y: number;
  r: number;
  dur: number;
  delay: number;
}

/** Soft drifting motes (screen space) that twinkle across the world. */
export const FIREFLIES: FireflySpec[] = [
  { x: 360, y: 250, r: 2.4, dur: 5.2, delay: 0 },
  { x: 840, y: 236, r: 2.0, dur: 6.1, delay: 1.3 },
  { x: 600, y: 176, r: 2.6, dur: 5.6, delay: 0.6 },
  { x: 470, y: 430, r: 2.0, dur: 6.4, delay: 2.1 },
  { x: 742, y: 412, r: 2.3, dur: 5.0, delay: 1.7 },
  { x: 250, y: 360, r: 1.8, dur: 6.8, delay: 0.9 },
  { x: 950, y: 360, r: 1.8, dur: 6.6, delay: 2.6 },
  { x: 540, y: 520, r: 2.1, dur: 5.9, delay: 1.1 },
  { x: 660, y: 300, r: 1.6, dur: 7.2, delay: 3.0 },
  { x: 300, y: 212, r: 1.7, dur: 6.0, delay: 0.3 },
  { x: 900, y: 212, r: 1.7, dur: 6.3, delay: 2.2 },
  { x: 600, y: 470, r: 2.2, dur: 5.4, delay: 1.5 },
];
