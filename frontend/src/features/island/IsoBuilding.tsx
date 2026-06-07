/**
 * A 2.5D scenario landmark — an isometric building rendered as a pseudo-3D prism
 * (shaded walls + a hip roof + a ground pad) from a dynamic {@link IsoBuildingPlacement}.
 * Buildings are **status surfaces** (each shows a bubble with its name + state)
 * and a doorway you can click to **enter the plaza**. The glyph bobs gently on a
 * desynced loop; the active scene gets a breathing signal. Memoized — it depends
 * only on the placement + tone, never the per-frame traveler tick.
 *
 * Colors come from the scene's design token via `currentColor`, so a building
 * reads the same hue everywhere and follows a re-skin of `styles/index.css`.
 */
import { memo } from "react";
import { motion } from "motion/react";

import { bob, breathe } from "../../lib/anim";
import type { IsoBuildingPlacement } from "./iso";
import { TILE_H, TILE_W, polyStr, prismFaces } from "./iso";

export type BuildingTone = "active" | "done" | "upcoming" | "idle";

export interface IsoBuildingProps {
  placement: IsoBuildingPlacement;
  /** Localized scene name shown in the bubble + used as the click affordance. */
  name: string;
  /** Localized status line shown in the bubble. */
  statusLabel: string;
  tone: BuildingTone;
  /** Bob phase offset (seconds) so buildings don't float in lockstep. */
  phase: number;
  reduce: boolean;
  onEnter?: () => void;
  /** Footprint multiplier (tiles). Default 0.82 so neighbors don't collide. */
  footprint?: number;
}

const STATUS_COLOR: Record<BuildingTone, string> = {
  active: "currentColor",
  done: "var(--color-journey-returned)",
  upcoming: "var(--color-faint)",
  idle: "var(--color-faint)",
};

function IsoBuildingImpl({
  placement,
  name,
  statusLabel,
  tone,
  phase,
  reduce,
  onEnter,
  footprint = 0.82,
}: IsoBuildingProps) {
  const { base, color, emoji } = placement;
  const lit = tone === "active" || tone === "done";
  const interactive = !!onEnter;

  const halfW = (TILE_W / 2) * footprint;
  const halfD = (TILE_H / 2) * footprint;
  const height = 64 * footprint;
  const roofH = 32 * footprint;

  const faces = prismFaces(base, halfW, halfD, height);
  const topY = base.y - height;
  const apex = { x: base.x, y: topY - roofH };
  const tN = faces.top[0]!;
  const tE = faces.top[1]!;
  const tS = faces.top[2]!;
  const tW = faces.top[3]!;

  const glowOpacity = tone === "active" ? 0.3 : tone === "done" ? 0.16 : 0.08;
  const statusColor = STATUS_COLOR[tone];
  const bubbleY = apex.y - 30;
  const bubbleW = Math.max(120, name.length * 9 + statusLabel.length * 6 + 56);

  return (
    <g
      style={{ color, cursor: interactive ? "pointer" : "default" }}
      onClick={onEnter}
      role={interactive ? "button" : undefined}
      aria-label={interactive ? name : undefined}
    >
      {/* ground shadow + tinted pad */}
      <ellipse cx={base.x} cy={base.y + 4} rx={halfW * 1.18} ry={halfD * 0.86} fill="#000" opacity={0.22} />
      <polygon
        points={polyStr([
          { x: base.x, y: base.y - halfD * 1.32 },
          { x: base.x + halfW * 1.32, y: base.y },
          { x: base.x, y: base.y + halfD * 1.32 },
          { x: base.x - halfW * 1.32, y: base.y },
        ])}
        fill="currentColor"
        opacity={tone === "active" ? 0.16 : 0.08}
      />

      <motion.g
        initial={{ y: 0 }}
        animate={reduce ? { y: 0 } : { y: [0, -4, 0] }}
        transition={reduce ? { duration: 0 } : bob(6, phase)}
      >
        {/* district glow */}
        <ellipse cx={base.x} cy={base.y - height * 0.4} rx={halfW * 1.5} ry={halfW * 0.9} fill="currentColor" opacity={glowOpacity} filter="url(#isoSoftBlur)" />

        {/* active breathing ring on the pad */}
        {tone === "active" && !reduce && (
          <motion.ellipse
            cx={base.x}
            cy={base.y}
            rx={halfW * 1.3}
            ry={halfD * 1.3}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            initial={{ opacity: 0.5, scale: 0.8 }}
            animate={{ opacity: [0.5, 0], scale: [0.8, 1.3] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeOut" }}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
        )}

        {/* walls — left (SW, darkest), right (SE), with outlines */}
        <polygon points={polyStr(faces.left)} fill="currentColor" opacity={0.5} />
        <polygon points={polyStr(faces.left)} fill="#05070f" opacity={0.32} />
        <polygon points={polyStr(faces.right)} fill="currentColor" opacity={0.72} />
        <polygon points={polyStr(faces.right)} fill="#05070f" opacity={0.12} />

        {/* doorway on the front corner */}
        <path
          d={`M ${base.x - 7 * footprint} ${base.y - 2} L ${base.x - 7 * footprint} ${base.y - 22 * footprint} Q ${base.x} ${base.y - 30 * footprint} ${base.x + 7 * footprint} ${base.y - 22 * footprint} L ${base.x + 7 * footprint} ${base.y - 2} Z`}
          fill="#05070f"
          opacity={0.55}
          stroke="currentColor"
          strokeOpacity={lit ? 0.7 : 0.4}
          strokeWidth={1.2}
        />

        {/* windows (warm when the scene is lit) */}
        <polygon
          points={polyStr([
            { x: base.x - halfW * 0.5, y: base.y - height * 0.62 },
            { x: base.x - halfW * 0.2, y: base.y - height * 0.62 - halfD * 0.3 },
            { x: base.x - halfW * 0.2, y: base.y - height * 0.34 - halfD * 0.3 },
            { x: base.x - halfW * 0.5, y: base.y - height * 0.34 },
          ])}
          fill="currentColor"
          opacity={lit ? 0.85 : 0.35}
        />

        {/* hip roof — four slopes meeting at an apex (front two on top) */}
        <polygon points={polyStr([tN, tW, apex])} fill="currentColor" opacity={0.62} />
        <polygon points={polyStr([tN, tE, apex])} fill="currentColor" opacity={0.78} />
        <polygon points={polyStr([tW, tS, apex])} fill="currentColor" opacity={0.92} />
        <polygon points={polyStr([tW, tS, apex])} fill="#05070f" opacity={0.18} />
        <polygon points={polyStr([tE, tS, apex])} fill="currentColor" opacity={1} />
        {/* roof rim */}
        <polyline points={polyStr([tW, tS, tE])} fill="none" stroke="#05070f" strokeOpacity={0.25} strokeWidth={1.4} />

        {/* sign disc with the scene emoji */}
        <circle cx={base.x} cy={base.y - height * 0.52} r={11 * footprint} fill="var(--color-surface)" stroke="currentColor" strokeWidth={1.6} />
        <text x={base.x} y={base.y - height * 0.52 + 0.5} textAnchor="middle" dominantBaseline="central" fontSize={12 * footprint}>
          {emoji}
        </text>
      </motion.g>

      {/* status bubble */}
      <g transform={`translate(${base.x} ${bubbleY})`}>
        <rect
          x={-bubbleW / 2}
          y={-15}
          width={bubbleW}
          height={30}
          rx={11}
          fill="var(--color-surface)"
          opacity={0.95}
          stroke={statusColor}
          strokeOpacity={tone === "active" ? 0.9 : 0.45}
          strokeWidth={tone === "active" ? 1.5 : 1}
        />
        <text x={-bubbleW / 2 + 13} y={-1} textAnchor="start" dominantBaseline="central" fontSize={12}>
          {emoji}
        </text>
        <text
          x={-bubbleW / 2 + 30}
          y={-3.5}
          textAnchor="start"
          dominantBaseline="central"
          fontSize={11.5}
          fill="var(--color-ink)"
          fontWeight={600}
          fontFamily="var(--font-sans)"
        >
          {name.length > 12 ? `${name.slice(0, 11)}…` : name}
        </text>
        {tone === "active" && !reduce ? (
          <motion.circle
            cx={-bubbleW / 2 + 33}
            cy={7.5}
            r={3}
            fill={statusColor}
            animate={{ scale: [1, 1.7, 1], opacity: [0.9, 0.3, 0.9] }}
            transition={breathe}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
        ) : (
          <circle cx={-bubbleW / 2 + 33} cy={7.5} r={3} fill={statusColor} opacity={tone === "upcoming" || tone === "idle" ? 0.6 : 0.95} />
        )}
        <text
          x={-bubbleW / 2 + 42}
          y={8}
          textAnchor="start"
          dominantBaseline="central"
          fontSize={10}
          fill={statusColor}
          fontFamily="var(--font-sans)"
        >
          {statusLabel}
        </text>
      </g>
    </g>
  );
}

export const IsoBuilding = memo(IsoBuildingImpl);
