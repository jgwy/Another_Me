/**
 * Ambient life for the living world — resident twins gently milling about and
 * drifting fireflies. Pure, seeded data so the world looks inhabited without a
 * backend. Coordinates are in the {@link WORLD} viewBox space; the residents
 * loop over small polygons via `wander()` and the fireflies bob via `bob()`,
 * both transform/opacity-only (60fps, SC1).
 */
import type { Pt } from "./worldLayout";

export interface ResidentSpec {
  id: string;
  emoji: string;
  /** CSS custom-property accent (consumes the design tokens). */
  colorVar: string;
  /** Closed-ish loop of waypoints the resident wanders. */
  loop: Pt[];
  /** Seconds for one full loop. */
  dur: number;
  /** Start offset so residents desync. */
  delay: number;
  /** Relative size of the little mascot. */
  scale: number;
}

const SCENE_VARS = [
  "var(--color-scn-exchange)",
  "var(--color-scn-cafe)",
  "var(--color-scn-lab)",
  "var(--color-scn-coding)",
  "var(--color-brand)",
  "var(--color-accent)",
];

/**
 * Seven residents tucked into the open meadows between districts (kept clear of
 * the central plaza + routes so they never collide with the travelling frog).
 */
export const RESIDENTS: ResidentSpec[] = [
  { id: "r1", emoji: "🐢", loop: [{ x: 470, y: 318 }, { x: 432, y: 356 }, { x: 470, y: 392 }, { x: 516, y: 356 }], dur: 26, delay: 0, scale: 0.92 },
  { id: "r2", emoji: "🦊", loop: [{ x: 712, y: 326 }, { x: 760, y: 360 }, { x: 724, y: 404 }, { x: 678, y: 366 }], dur: 30, delay: 2.4, scale: 0.96 },
  { id: "r3", emoji: "🦉", loop: [{ x: 600, y: 224 }, { x: 558, y: 256 }, { x: 600, y: 286 }, { x: 644, y: 256 }], dur: 24, delay: 1.1, scale: 0.88 },
  { id: "r4", emoji: "🦝", loop: [{ x: 408, y: 540 }, { x: 452, y: 568 }, { x: 500, y: 540 }, { x: 452, y: 514 }], dur: 28, delay: 3.2, scale: 0.9 },
  { id: "r5", emoji: "🐼", loop: [{ x: 700, y: 540 }, { x: 748, y: 566 }, { x: 792, y: 540 }, { x: 748, y: 516 }], dur: 27, delay: 1.8, scale: 0.94 },
  { id: "r6", emoji: "🦄", loop: [{ x: 132, y: 348 }, { x: 168, y: 380 }, { x: 132, y: 412 }, { x: 100, y: 380 }], dur: 32, delay: 0.6, scale: 0.86 },
  { id: "r7", emoji: "🐬", loop: [{ x: 1064, y: 348 }, { x: 1100, y: 380 }, { x: 1064, y: 412 }, { x: 1028, y: 380 }], dur: 31, delay: 2.9, scale: 0.86 },
].map((r, i) => ({ ...r, colorVar: SCENE_VARS[i % SCENE_VARS.length]! }));

export interface FireflySpec {
  x: number;
  y: number;
  r: number;
  dur: number;
  delay: number;
}

/** Soft drifting motes that twinkle across the world. */
export const FIREFLIES: FireflySpec[] = [
  { x: 360, y: 300, r: 2.4, dur: 5.2, delay: 0 },
  { x: 840, y: 286, r: 2.0, dur: 6.1, delay: 1.3 },
  { x: 600, y: 196, r: 2.6, dur: 5.6, delay: 0.6 },
  { x: 470, y: 470, r: 2.0, dur: 6.4, delay: 2.1 },
  { x: 742, y: 462, r: 2.3, dur: 5.0, delay: 1.7 },
  { x: 220, y: 360, r: 1.8, dur: 6.8, delay: 0.9 },
  { x: 980, y: 360, r: 1.8, dur: 6.6, delay: 2.6 },
  { x: 540, y: 540, r: 2.1, dur: 5.9, delay: 1.1 },
  { x: 660, y: 320, r: 1.6, dur: 7.2, delay: 3.0 },
  { x: 300, y: 232, r: 1.7, dur: 6.0, delay: 0.3 },
  { x: 900, y: 232, r: 1.7, dur: 6.3, delay: 2.2 },
  { x: 600, y: 470, r: 2.2, dur: 5.4, delay: 1.5 },
];
