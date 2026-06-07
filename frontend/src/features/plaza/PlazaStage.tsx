/**
 * The plaza stage — a small, lightly-isometric arena where the present twins
 * (小人) drift gently on looped paths and are clickable. Encounters in progress
 * are drawn as a soft link between the two participants. Intentionally light:
 * transform/opacity Motion only, no per-frame simulation; reduced motion freezes
 * everyone in place. Reuses the world's `IsoCharacter` + projection so the plaza
 * reads as the same world as the map.
 */
import { memo } from "react";
import { motion } from "motion/react";

import { wander } from "../../lib/anim";
import { IsoCharacter } from "../island/IsoCharacter";
import { JOURNEY_COLOR } from "../island/worldLayout";
import type { Pt } from "../island/iso";
import { ISO_VIEW, TILE_H, TILE_W, polyStr, projectIso, roundedPath } from "../island/iso";
import type { PlazaEncounter, PresenceTwin } from "./presence";

export interface PlazaStageProps {
  present: PresenceTwin[];
  encounters: PlazaEncounter[];
  reduce: boolean;
  onSelect: (twin: PresenceTwin) => void;
  /** Emoji shown on the central pad disc (the scene's glyph). */
  centerEmoji?: string;
  plazaLabel: string;
}

function bubbleFor(status: PresenceTwin["status"]): "thinking" | "talking" | null {
  if (status === "thinking") return "thinking";
  if (status === "talking" || status === "meeting") return "talking";
  return null;
}

function PlazaStageImpl({ present, encounters, reduce, onSelect, centerEmoji, plazaLabel }: PlazaStageProps) {
  const center = projectIso({ gx: 0, gy: 0 });

  // Stable layout: sort by id (self first) so positions don't jump as statuses tick.
  const ordered = [...present].sort((a, b) =>
    a.is_self === b.is_self ? a.agent_id.localeCompare(b.agent_id) : a.is_self ? -1 : 1,
  );
  const n = ordered.length;
  const ringR = n <= 7 ? 1.95 : 2.55;

  const anchors = new Map<string, Pt>();
  ordered.forEach((tw, i) => {
    const angle = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
    anchors.set(tw.agent_id, projectIso({ gx: Math.cos(angle) * ringR, gy: Math.sin(angle) * ringR }));
  });

  const driftLoop = (p: Pt, seed: number): Pt[] => {
    const a = 6 + (seed % 3) * 2;
    return [
      { x: p.x, y: p.y - a },
      { x: p.x + a, y: p.y },
      { x: p.x, y: p.y + a },
      { x: p.x - a, y: p.y },
    ];
  };

  return (
    <svg
      viewBox={`0 0 ${ISO_VIEW.width} ${ISO_VIEW.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 h-full w-full select-none"
      role="img"
      aria-label="The plaza"
    >
      <defs>
        <radialGradient id="plazaFloor" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--color-elevated)" stopOpacity={1} />
          <stop offset="100%" stopColor="var(--color-surface)" stopOpacity={0.15} />
        </radialGradient>
      </defs>

      {/* plaza floor */}
      <ellipse cx={center.x} cy={center.y + 8} rx={TILE_W * 3.1} ry={TILE_H * 2.8} fill="#000" opacity={0.12} />
      <polygon
        points={polyStr([
          { x: center.x, y: center.y - TILE_H * 3 },
          { x: center.x + TILE_W * 3, y: center.y },
          { x: center.x, y: center.y + TILE_H * 3 },
          { x: center.x - TILE_W * 3, y: center.y },
        ])}
        fill="url(#plazaFloor)"
      />
      <polygon
        points={polyStr([
          { x: center.x, y: center.y - TILE_H * 3 },
          { x: center.x + TILE_W * 3, y: center.y },
          { x: center.x, y: center.y + TILE_H * 3 },
          { x: center.x - TILE_W * 3, y: center.y },
        ])}
        fill="none"
        stroke="var(--color-world-grass-edge)"
        strokeOpacity={0.35}
        strokeWidth={1.5}
      />
      {/* center medallion */}
      <circle cx={center.x} cy={center.y} r={26} fill="var(--color-surface)" stroke="var(--color-accent)" strokeOpacity={0.4} strokeWidth={1.4} />
      {centerEmoji && (
        <text x={center.x} y={center.y + 1} textAnchor="middle" dominantBaseline="central" fontSize={22}>
          {centerEmoji}
        </text>
      )}
      <text x={center.x} y={center.y + TILE_H * 3 + 18} textAnchor="middle" fontSize={12} fill="var(--color-faint)" fontFamily="var(--font-sans)">
        {plazaLabel}
      </text>

      {/* encounter links */}
      {encounters.map((enc) => {
        const a = enc.participants[0] ? anchors.get(enc.participants[0].id) : undefined;
        const b = enc.participants[1] ? anchors.get(enc.participants[1].id) : undefined;
        if (!a || !b) return null;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 26 };
        return (
          <g key={`link-${enc.id}`}>
            <path d={roundedPath([a, mid, b])} fill="none" stroke="var(--color-journey-talking)" strokeOpacity={0.5} strokeWidth={2} strokeDasharray="3 7" strokeLinecap="round" />
            {!reduce && (
              <motion.circle
                cx={mid.x}
                cy={mid.y}
                r={4}
                fill="var(--color-journey-talking)"
                animate={{ opacity: [0.4, 1, 0.4], scale: [0.9, 1.2, 0.9] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
              />
            )}
          </g>
        );
      })}

      {/* present twins */}
      {ordered.map((tw, i) => {
        const anchor = anchors.get(tw.agent_id)!;
        const loop = driftLoop(anchor, i + 1);
        const xs = loop.map((p) => p.x);
        const ys = loop.map((p) => p.y);
        const color = tw.is_self ? "var(--color-brand)" : JOURNEY_COLOR[tw.status];
        return (
          <motion.g
            key={tw.agent_id}
            initial={{ x: xs[0], y: ys[0] }}
            animate={reduce ? { x: anchor.x, y: anchor.y } : { x: [...xs, xs[0]!], y: [...ys, ys[0]!] }}
            transition={reduce ? { duration: 0 } : wander(15 + i * 1.4, i * 0.5)}
            style={{ cursor: "pointer", transformBox: "fill-box", transformOrigin: "50% 80%" }}
            whileHover={reduce ? undefined : { scale: 1.1 }}
            onClick={() => onSelect(tw)}
          >
            <IsoCharacter
              emoji={tw.agent.avatar}
              name={tw.agent.name}
              color={color}
              walking={!reduce}
              reduce={reduce}
              scale={tw.is_self ? 1.12 : 0.98}
              phase={(i % 4) * 0.12}
              bubble={bubbleFor(tw.status)}
              label={tw.agent.name}
            />
          </motion.g>
        );
      })}
    </svg>
  );
}

export const PlazaStage = memo(PlazaStageImpl);
