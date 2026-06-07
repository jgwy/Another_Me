/**
 * The travelling twin — the user's own little character — on its own SVG layer
 * stacked exactly over the static {@link IsoWorld}. Its position is driven every
 * frame by the journey tick (`useTripJourney`), so the twin thinks at home, sets
 * out, crosses the world, meets a partner, talks, and returns. Position +
 * flourishes are derived deterministically from the tick (transform/opacity
 * only) so it holds 60fps; the status pill swaps with `statusSwap`. Clicking the
 * twin focuses the encounter it is currently visiting.
 *
 * At integration this layer doesn't change — feed it the live `agent_status` +
 * progress from the journey SSE stream instead of the simulator.
 */
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { AgentStatus } from "../../lib/trips";
import { statusSwap } from "../../lib/anim";
import { IsoCharacter } from "./IsoCharacter";
import { JOURNEY_COLOR } from "./worldLayout";
import type { Pt } from "./iso";
import { ISO_VIEW, placeTraveler } from "./iso";

export interface IsoTravelerProps {
  route: { home: Pt; plaza: Pt; anchors: Pt[] };
  status: AgentStatus;
  encounterIndex: number;
  /** 0..1 progress within the current status (drives path tweening). */
  progress: number;
  reduce: boolean;
  twinName: string;
  twinAvatar: string | null;
  onFocus: (index: number) => void;
}

export function IsoTraveler({
  route,
  status,
  encounterIndex,
  progress,
  reduce,
  twinName,
  twinAvatar,
  onFocus,
}: IsoTravelerProps) {
  const { t } = useTranslation("island");
  const { x, y, faceLeft, walking } = placeTraveler(route, status, encounterIndex, progress);
  const color = JOURNEY_COLOR[status];
  const conversing = status === "meeting" || status === "talking";
  const thinking = status === "thinking";

  // Fading footprints behind the twin while it travels (transform/opacity only).
  const trail =
    walking && !reduce
      ? [1, 2, 3, 4].map((i) => {
          const p = placeTraveler(route, status, encounterIndex, progress - i * 0.05);
          return { x: p.x, y: p.y, opacity: 0.26 - i * 0.05 };
        })
      : [];

  const statusLabel = t(`journey.status.${status}`);
  const pillW = Math.max(58, statusLabel.length * 12 + 28);

  return (
    <svg
      viewBox={`0 0 ${ISO_VIEW.width} ${ISO_VIEW.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 h-full w-full select-none"
      style={{ pointerEvents: "none" }}
      aria-hidden
    >
      {/* footprints */}
      {trail.map((d, i) => (
        <ellipse key={`step-${i}`} cx={d.x} cy={d.y} rx={6} ry={2.2} fill={color} opacity={d.opacity} />
      ))}

      <g transform={`translate(${x} ${y})`} style={{ pointerEvents: "auto", cursor: "pointer" }} onClick={() => onFocus(encounterIndex)}>
        {/* status aura */}
        <ellipse cx={0} cy={-18} rx={24} ry={18} fill={color} opacity={reduce ? 0.16 : 0.18} />

        <IsoCharacter
          emoji={twinAvatar}
          name={twinName}
          color="var(--color-brand)"
          walking={walking}
          faceLeft={faceLeft}
          reduce={reduce}
          scale={1.2}
          bubble={thinking ? "thinking" : conversing ? "talking" : null}
        />

        {/* status pill */}
        <g transform="translate(0 -58)">
          <AnimatePresence mode="wait" initial={false}>
            <motion.g
              key={status}
              variants={reduce ? undefined : statusSwap}
              initial={reduce ? false : "hidden"}
              animate={reduce ? undefined : "show"}
              exit={reduce ? undefined : "exit"}
            >
              <rect x={-pillW / 2} y={-11} width={pillW} height={22} rx={11} fill="var(--color-surface)" opacity={0.96} stroke={color} strokeOpacity={0.7} strokeWidth={1.1} />
              <circle cx={-pillW / 2 + 13} cy={0} r={3} fill={color} />
              <text x={5} y={1} textAnchor="middle" dominantBaseline="central" fontSize={11.5} fill={color} fontWeight={600} fontFamily="var(--font-sans)">
                {statusLabel}
              </text>
            </motion.g>
          </AnimatePresence>
        </g>
      </g>
    </svg>
  );
}
