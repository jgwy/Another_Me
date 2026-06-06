/**
 * A refined scenario landmark. Buildings are *status surfaces*, not "enter"
 * buttons (per the codex guide-map): each shows one unified bubble above it
 * with its icon, name, and current status. The whole glyph bobs gently on a
 * desynced loop; the active district gets a breathing signal. Memoized — it
 * depends only on the trip, never the per-frame journey tick.
 */
import { memo } from "react";
import { motion } from "motion/react";

import { bob, breathe } from "../../lib/anim";
import type { BuildingSpec } from "./worldLayout";

export type BuildingTone = "active" | "done" | "upcoming" | "idle";

export interface WorldBuildingProps {
  spec: BuildingSpec;
  /** Localized scene name shown in the bubble. */
  name: string;
  /** Localized status line shown in the bubble. */
  statusLabel: string;
  tone: BuildingTone;
  /** Bob phase offset (seconds) so buildings don't float in lockstep. */
  phase: number;
  reduce: boolean;
}

const STATUS_COLOR: Record<BuildingTone, string> = {
  active: "currentColor",
  done: "var(--color-journey-returned)",
  upcoming: "var(--color-faint)",
  idle: "var(--color-faint)",
};

function WorldBuildingImpl({ spec, name, statusLabel, tone, phase, reduce }: WorldBuildingProps) {
  const { pos, emoji, colorVar } = spec;
  const lit = tone === "active" || tone === "done";
  const glowOpacity = tone === "active" ? 0.26 : tone === "done" ? 0.15 : 0.08;
  const statusColor = STATUS_COLOR[tone];

  return (
    <g transform={`translate(${pos.x} ${pos.y})`} style={{ color: colorVar }}>
      <motion.g
        initial={{ y: 0 }}
        animate={reduce ? { y: 0 } : { y: [0, -5, 0] }}
        transition={reduce ? { duration: 0 } : bob(6, phase)}
      >
        {/* district glow */}
        <circle r={80} cy={-4} fill="currentColor" opacity={glowOpacity} filter="url(#worldSoftBlur)" />

        {/* active breathing ring */}
        {tone === "active" && !reduce && (
          <motion.circle
            r={64}
            cy={-2}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            initial={{ scale: 0.7, opacity: 0.55 }}
            animate={{ scale: [0.7, 1.25], opacity: [0.55, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeOut" }}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
        )}

        {/* roof */}
        <path d="M -66 -18 L -46 -52 L 46 -52 L 66 -18 Z" fill="currentColor" opacity={0.95} />
        <path d="M -66 -18 L -46 -52 L 46 -52 L 66 -18 Z" fill="#05070f" opacity={0.18} />

        {/* body */}
        <rect x={-56} y={-18} width={112} height={70} rx={11} fill="#12121d" stroke="currentColor" strokeWidth={1.8} />
        <rect x={-56} y={-18} width={112} height={70} rx={11} fill="currentColor" opacity={0.07} />

        {/* windows */}
        <rect x={-42} y={-6} width={18} height={15} rx={3.5} fill="currentColor" opacity={lit ? 0.85 : 0.4} />
        <rect x={24} y={-6} width={18} height={15} rx={3.5} fill="currentColor" opacity={lit ? 0.85 : 0.4} />

        {/* sign disc */}
        <circle cx={0} cy={24} r={16} fill="#0f0f1a" stroke="currentColor" strokeWidth={1.8} />
        <text x={0} y={25} textAnchor="middle" dominantBaseline="central" fontSize={17}>
          {emoji}
        </text>

        {/* unified status bubble */}
        <g transform="translate(0 -78)">
          <rect
            x={-76}
            y={-22}
            width={152}
            height={40}
            rx={12}
            fill="#0b0b14"
            opacity={0.94}
            stroke={statusColor}
            strokeOpacity={tone === "active" ? 0.95 : 0.5}
            strokeWidth={tone === "active" ? 1.6 : 1}
          />
          <text x={-58} y={-7} textAnchor="start" dominantBaseline="central" fontSize={13}>
            {emoji}
          </text>
          <text
            x={-40}
            y={-7}
            textAnchor="start"
            dominantBaseline="central"
            fontSize={12.5}
            fill="#ecedf6"
            fontWeight={600}
            fontFamily="Inter, system-ui, sans-serif"
          >
            {name}
          </text>
          {/* status dot */}
          {tone === "active" && !reduce ? (
            <motion.circle
              cx={-60}
              cy={8}
              r={3.5}
              fill={statusColor}
              animate={{ scale: [1, 1.7, 1], opacity: [0.9, 0.3, 0.9] }}
              transition={breathe}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            />
          ) : (
            <circle cx={-60} cy={8} r={3.5} fill={statusColor} opacity={tone === "upcoming" || tone === "idle" ? 0.6 : 0.95} />
          )}
          <text
            x={-50}
            y={9}
            textAnchor="start"
            dominantBaseline="central"
            fontSize={10.5}
            fill={statusColor}
            fontFamily="Inter, system-ui, sans-serif"
          >
            {statusLabel}
          </text>
        </g>
      </motion.g>
    </g>
  );
}

export const WorldBuilding = memo(WorldBuildingImpl);
