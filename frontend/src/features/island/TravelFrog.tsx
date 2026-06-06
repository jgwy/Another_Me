/**
 * The travelling twin — a little frog mascot — rendered on its own SVG layer
 * stacked exactly over the static {@link WorldMap}. Its position is driven every
 * frame by the journey simulation tick (`useJourneySimulation`), so the frog
 * thinks at home, sets out, crosses the world, meets a partner, talks, and
 * returns. Position + all flourishes are derived deterministically from the
 * tick (transform/opacity only) so it holds 60fps without competing Motion
 * loops; status changes swap with `statusSwap` + AnimatePresence. Clicking the
 * frog focuses the encounter it is currently visiting.
 *
 * At integration this layer doesn't change — just feed it the live journey
 * status/progress from the SSE stream instead of the simulator.
 */
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { ScenarioKey } from "../../lib/api";
import type { AgentStatus } from "../../lib/trips";
import { statusSwap } from "../../lib/anim";
import { JOURNEY_COLOR, WORLD, placeFrog } from "./worldLayout";

export interface TravelFrogProps {
  /** Ordered scene of each encounter, so the frog knows its route. */
  keys: ScenarioKey[];
  status: AgentStatus;
  encounterIndex: number;
  /** 0..1 within the current status (drives path tweening + flourishes). */
  progress: number;
  reduce: boolean;
  onFocus: (index: number) => void;
}

const TAU = Math.PI * 2;

export function TravelFrog({ keys, status, encounterIndex, progress, reduce, onFocus }: TravelFrogProps) {
  const { t } = useTranslation("island");
  const { width, height } = WORLD;

  const { x, y, faceLeft } = placeFrog(keys, status, encounterIndex, progress);
  const traveling = status === "traveling" || status === "returning";
  const thinking = status === "thinking";
  const conversing = status === "meeting" || status === "talking";
  const color = JOURNEY_COLOR[status];

  // Deterministic flourishes from the tick — no competing rAF loops.
  const phase = reduce ? 0 : progress * TAU;
  const pulse = reduce ? 0 : progress * TAU * 2.2;
  const hop = traveling ? Math.abs(Math.sin(progress * Math.PI * 6)) * -3 : 0;
  const auraOpacity = 0.16 + (reduce ? 0 : Math.sin(phase) * 0.06);
  const flip = faceLeft ? -1 : 1;

  // Fading footprints behind the frog while it travels.
  const trail = traveling && !reduce
    ? [1, 2, 3, 4].map((i) => {
        const p = placeFrog(keys, status, encounterIndex, progress - i * 0.05);
        return { x: p.x, y: p.y, opacity: 0.28 - i * 0.055 };
      })
    : [];

  const statusLabel = t(`journey.status.${status}`);
  const pillWidth = Math.max(58, statusLabel.length * 12 + 30);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 h-full w-full select-none"
      style={{ pointerEvents: "none" }}
      aria-hidden
    >
      <defs>
        <linearGradient id="frogBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6ee7b7" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>

      {/* footprints */}
      {trail.map((d, i) => (
        <ellipse key={`trail-${i}`} cx={d.x} cy={d.y + 18} rx={6} ry={2.4} fill={color} opacity={d.opacity} />
      ))}

      <g
        transform={`translate(${x} ${y})`}
        style={{ pointerEvents: "auto", cursor: "pointer" }}
        onClick={() => onFocus(encounterIndex)}
      >
        {/* status aura + ground spotlight */}
        <circle r={26} cy={-2} fill={color} opacity={auraOpacity} />
        <ellipse cx={0} cy={20} rx={18} ry={4.5} fill="#000" opacity={0.3} />

        {/* frog body (mirrored to face travel direction / partner) */}
        <g transform={`translate(0 ${hop}) scale(${flip} 1)`}>
          {/* back legs */}
          <ellipse cx={-12} cy={15} rx={6} ry={3.6} fill="#0f9b6b" />
          <ellipse cx={12} cy={15} rx={6} ry={3.6} fill="#0f9b6b" />
          {/* body */}
          <ellipse cx={0} cy={2} rx={17} ry={15} fill="url(#frogBody)" />
          <ellipse cx={0} cy={7} rx={9} ry={7} fill="#d1fae5" opacity={0.45} />
          {/* feet */}
          <ellipse cx={-10} cy={16} rx={5} ry={3} fill="#0f9b6b" />
          <ellipse cx={10} cy={16} rx={5} ry={3} fill="#0f9b6b" />
          {/* travel pack */}
          <rect x={7} y={-3} width={10} height={13} rx={3} fill="var(--color-scn-lab)" opacity={0.9} />
          <rect x={6} y={-1} width={12} height={2.4} rx={1.2} fill="#0b0b14" opacity={0.5} />
          {/* eye domes */}
          <circle cx={-7} cy={-12} r={6} fill="#ecfdf5" stroke="#0f9b6b" strokeWidth={1.2} />
          <circle cx={7} cy={-12} r={6} fill="#ecfdf5" stroke="#0f9b6b" strokeWidth={1.2} />
          <circle cx={-6} cy={-12} r={2.6} fill="#08130d" />
          <circle cx={8} cy={-12} r={2.6} fill="#08130d" />
          {/* smile */}
          <path d="M -6 4 Q 0 9 6 4" fill="none" stroke="#08130d" strokeWidth={1.4} strokeLinecap="round" />
        </g>

        {/* thinking dots */}
        {thinking && (
          <g transform="translate(13 -28)">
            {[0, 1, 2].map((i) => {
              const s = reduce ? 1 : 0.7 + Math.abs(Math.sin(pulse + i * 0.7)) * 0.5;
              return <circle key={i} cx={i * 7} cy={0} r={2.1} fill={color} opacity={0.5 + 0.2 * s} transform={`scale(${s})`} style={{ transformOrigin: `${i * 7}px 0px` }} />;
            })}
          </g>
        )}

        {/* speech dots while meeting / talking */}
        {conversing && (
          <g transform="translate(-26 -26)">
            <rect x={-16} y={-9} width={32} height={18} rx={9} fill="#0b0b14" opacity={0.92} stroke={color} strokeOpacity={0.6} />
            {[0, 1, 2].map((i) => {
              const s = reduce ? 1 : 0.6 + Math.abs(Math.sin(pulse * 1.1 + i * 0.9)) * 0.6;
              return <circle key={i} cx={-7 + i * 7} cy={0} r={2} fill={color} opacity={0.7} transform={`scale(${s})`} style={{ transformOrigin: `${-7 + i * 7}px 0px` }} />;
            })}
          </g>
        )}

        {/* status pill */}
        <g transform="translate(0 -44)">
          <AnimatePresence mode="wait" initial={false}>
            <motion.g
              key={status}
              variants={reduce ? undefined : statusSwap}
              initial={reduce ? false : "hidden"}
              animate={reduce ? undefined : "show"}
              exit={reduce ? undefined : "exit"}
            >
              <rect x={-pillWidth / 2} y={-11} width={pillWidth} height={22} rx={11} fill="#0b0b14" opacity={0.95} stroke={color} strokeOpacity={0.7} strokeWidth={1.1} />
              <circle cx={-pillWidth / 2 + 13} cy={0} r={3} fill={color} />
              <text x={5} y={1} textAnchor="middle" dominantBaseline="central" fontSize={11.5} fill={color} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">
                {statusLabel}
              </text>
            </motion.g>
          </AnimatePresence>
        </g>
      </g>
    </svg>
  );
}
