/**
 * The static 2.5D world layer: an isometric ground field (tile grid), winding
 * routes home → plaza → each district, the central plaza platform, the twin's
 * home, ambient resident 小人 wandering the meadow, drifting motes, and the
 * dynamically-placed scenario buildings painted **back-to-front**. This whole
 * SVG is **memoized** and depends only on the layout + per-building scene state
 * (never the per-frame traveler tick) — so while the hero animates on the
 * stacked live layer, none of this re-renders.
 */
import { memo } from "react";
import { motion } from "motion/react";

import { wander, bob } from "../../lib/anim";
import { FIREFLIES, RESIDENTS } from "./ambient";
import { IsoCharacter } from "./IsoCharacter";
import { IsoBuilding } from "./IsoBuilding";
import type { BuildingTone } from "./IsoBuilding";
import type { IsoLayout } from "./iso";
import { ISO_VIEW, TILE_H, TILE_W, polyStr, projectIso, roundedPath } from "./iso";

export interface BuildingScene {
  /** Short localized name shown in the building's status bubble. */
  name: string;
  statusLabel: string;
  tone: BuildingTone;
}

export interface IsoWorldProps {
  layout: IsoLayout;
  /** Per-building view model keyed by `scenario.id`. */
  scenes: Map<string, BuildingScene>;
  homeLabel: string;
  plazaLabel: string;
  reduce: boolean;
  onEnter: (scenarioId: string) => void;
}

const IDLE_SCENE: BuildingScene = { name: "", statusLabel: "", tone: "idle" };

function IsoWorldImpl({ layout, scenes, homeLabel, plazaLabel, reduce, onEnter }: IsoWorldProps) {
  const { home, plaza, buildings, radius } = layout;
  const G = radius + 1.45;

  // Ground field corners (a big iso diamond covering the tile grid).
  const field = [
    projectIso({ gx: -G, gy: -G }),
    projectIso({ gx: G, gy: -G }),
    projectIso({ gx: G, gy: G }),
    projectIso({ gx: -G, gy: G }),
  ];

  // Tile grid lines (subtle), one per integer row/column across the field.
  const lines: string[] = [];
  for (let i = -Math.floor(G); i <= Math.floor(G); i++) {
    lines.push(roundedPath([projectIso({ gx: i, gy: -G }), projectIso({ gx: i, gy: G })]));
    lines.push(roundedPath([projectIso({ gx: -G, gy: i }), projectIso({ gx: G, gy: i })]));
  }

  return (
    <svg
      viewBox={`0 0 ${ISO_VIEW.width} ${ISO_VIEW.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 h-full w-full select-none"
      role="img"
      aria-label="The 2.5D living world"
    >
      <defs>
        <linearGradient id="isoGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-world-grass)" stopOpacity={0.85} />
          <stop offset="100%" stopColor="var(--color-world-grass)" stopOpacity={0.35} />
        </linearGradient>
        <radialGradient id="isoPlaza" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--color-elevated)" stopOpacity={1} />
          <stop offset="100%" stopColor="var(--color-surface)" stopOpacity={0.2} />
        </radialGradient>
        <radialGradient id="isoHome" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.7} />
          <stop offset="100%" stopColor="var(--color-world-grass)" stopOpacity={0.12} />
        </radialGradient>
        <filter id="isoSoftBlur" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      {/* ground field */}
      <polygon points={polyStr(field)} fill="url(#isoGround)" />
      <polygon points={polyStr(field)} fill="var(--color-world-grass-edge)" opacity={0.05} />
      <g stroke="var(--color-world-path)" strokeOpacity={0.5} strokeWidth={1}>
        {lines.map((d, i) => (
          <path key={`grid-${i}`} d={d} fill="none" />
        ))}
      </g>
      {/* field rim */}
      <polygon points={polyStr(field)} fill="none" stroke="var(--color-world-grass-edge)" strokeOpacity={0.3} strokeWidth={1.5} />

      {/* routes home → plaza → each district */}
      {buildings.map((b) => (
        <g key={`route-${b.scenario.id}`} style={{ color: b.color }}>
          <path d={roundedPath([home, plaza, b.anchor])} fill="none" stroke="var(--color-world-path)" strokeWidth={11} strokeLinecap="round" opacity={0.6} />
          <path d={roundedPath([home, plaza, b.anchor])} fill="none" stroke="currentColor" strokeOpacity={0.22} strokeWidth={2.5} strokeLinecap="round" strokeDasharray="2 12" />
        </g>
      ))}

      {/* central plaza platform */}
      <g>
        <ellipse cx={plaza.x} cy={plaza.y + 6} rx={TILE_W * 1.05} ry={TILE_H * 0.95} fill="#000" opacity={0.18} />
        <polygon
          points={polyStr([
            { x: plaza.x, y: plaza.y - TILE_H * 1.05 },
            { x: plaza.x + TILE_W * 1.05, y: plaza.y },
            { x: plaza.x, y: plaza.y + TILE_H * 1.05 },
            { x: plaza.x - TILE_W * 1.05, y: plaza.y },
          ])}
          fill="url(#isoPlaza)"
        />
        <polygon
          points={polyStr([
            { x: plaza.x, y: plaza.y - TILE_H * 0.7 },
            { x: plaza.x + TILE_W * 0.7, y: plaza.y },
            { x: plaza.x, y: plaza.y + TILE_H * 0.7 },
            { x: plaza.x - TILE_W * 0.7, y: plaza.y },
          ])}
          fill="none"
          stroke="var(--color-accent)"
          strokeOpacity={0.4}
          strokeWidth={1.4}
        />
        {!reduce && (
          <motion.polygon
            points={polyStr([
              { x: plaza.x, y: plaza.y - TILE_H * 0.7 },
              { x: plaza.x + TILE_W * 0.7, y: plaza.y },
              { x: plaza.x, y: plaza.y + TILE_H * 0.7 },
              { x: plaza.x - TILE_W * 0.7, y: plaza.y },
            ])}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={1.4}
            initial={{ opacity: 0.5, scale: 0.7 }}
            animate={{ opacity: [0.5, 0], scale: [0.7, 1.5] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: "easeOut" }}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
        )}
        <text x={plaza.x} y={plaza.y + TILE_H * 1.05 + 16} textAnchor="middle" fontSize={11} fill="var(--color-faint)" fontFamily="var(--font-sans)">
          {plazaLabel}
        </text>
      </g>

      {/* ambient residents (behind the buildings) */}
      <g aria-hidden>
        {RESIDENTS.map((r) => {
          const pts = r.loop.map((g) => projectIso(g));
          const xs = pts.map((p) => p.x);
          const ys = pts.map((p) => p.y);
          return (
            <motion.g
              key={r.id}
              initial={{ x: xs[0], y: ys[0] }}
              animate={reduce ? { x: xs[0], y: ys[0] } : { x: [...xs, xs[0]!], y: [...ys, ys[0]!] }}
              transition={reduce ? { duration: 0 } : wander(r.dur, r.delay)}
            >
              <IsoCharacter emoji={r.emoji} name={r.id} color={r.colorVar} walking={!reduce} reduce={reduce} scale={r.scale} phase={r.delay % 0.5} />
            </motion.g>
          );
        })}
      </g>

      {/* the twin's home (near the front of the field) */}
      <g transform={`translate(${home.x} ${home.y})`}>
        <ellipse cx={0} cy={6} rx={70} ry={22} fill="url(#isoHome)" />
        <ellipse cx={0} cy={8} rx={42} ry={11} fill="#000" opacity={0.2} />
        {/* lily-pad dome */}
        <path d="M -38 6 Q -38 -34 0 -34 Q 38 -34 38 6 Z" fill="var(--color-world-grass)" stroke="var(--color-accent)" strokeOpacity={0.5} strokeWidth={1.6} />
        <path d="M -38 6 Q -38 -34 0 -34 Q 38 -34 38 6 Z" fill="var(--color-accent)" opacity={0.1} />
        <circle cx={0} cy={-8} r={11} fill="var(--color-surface)" stroke="var(--color-accent)" strokeOpacity={0.55} strokeWidth={1.5} />
        <text x={0} y={-7.5} textAnchor="middle" dominantBaseline="central" fontSize={12}>
          🪷
        </text>
        {/* little flag */}
        <line x1={28} y1={-26} x2={28} y2={-52} stroke="var(--color-border)" strokeWidth={1.6} />
        <motion.path
          d="M 28 -52 L 46 -47 L 28 -42 Z"
          fill="var(--color-accent)"
          opacity={0.9}
          animate={reduce ? undefined : { rotate: [0, -4, 0] }}
          transition={reduce ? undefined : bob(3.5, 0)}
          style={{ transformBox: "fill-box", transformOrigin: "left center" }}
        />
        <g transform="translate(0 22)">
          <rect x={-26} y={-10} width={52} height={19} rx={9.5} fill="var(--color-surface)" opacity={0.92} stroke="var(--color-accent)" strokeOpacity={0.45} />
          <text textAnchor="middle" dominantBaseline="central" y={0} fontSize={11} fill="var(--color-ink)" fontWeight={600} fontFamily="var(--font-sans)">
            {homeLabel}
          </text>
        </g>
      </g>

      {/* district buildings — already sorted back-to-front */}
      {buildings.map((b, i) => {
        const scene = scenes.get(b.scenario.id) ?? IDLE_SCENE;
        return (
          <IsoBuilding
            key={`bld-${b.scenario.id}`}
            placement={b}
            name={scene.name || b.scenario.name}
            statusLabel={scene.statusLabel}
            tone={scene.tone}
            phase={i * 0.7}
            reduce={reduce}
            onEnter={() => onEnter(b.scenario.id)}
          />
        );
      })}

      {/* drifting motes (above everything static) */}
      <g aria-hidden>
        {FIREFLIES.map((f, i) => (
          <motion.circle
            key={`mote-${i}`}
            cx={f.x}
            cy={f.y}
            r={f.r}
            fill="var(--color-accent)"
            initial={{ opacity: reduce ? 0.35 : 0 }}
            animate={reduce ? { opacity: 0.35 } : { opacity: [0, 0.85, 0], y: [0, -16, 0] }}
            transition={reduce ? { duration: 0 } : bob(f.dur, f.delay)}
            style={{ filter: "drop-shadow(0 0 4px var(--color-accent))" }}
          />
        ))}
      </g>
    </svg>
  );
}

export const IsoWorld = memo(IsoWorldImpl);
