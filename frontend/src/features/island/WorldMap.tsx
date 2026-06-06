/**
 * The static living-world layer: ground, guide-map routes, district landmarks,
 * the central plaza, the frog's home, the partners met along the way, and the
 * ambient residents. This whole SVG is **memoized** and depends only on the
 * trip (never the per-frame journey tick) — so while the frog animates on the
 * stacked live layer, none of this re-renders. Clicking a partner focuses that
 * encounter.
 *
 * Colors come from the design tokens via `currentColor` (each group sets
 * `color: var(--color-scn-*)`), so a scene reads the same hue everywhere.
 */
import { memo } from "react";
import { motion } from "motion/react";

import type { ScenarioKey } from "../../lib/api";
import { Mascot } from "./Mascot";
import { AmbientLayer } from "./AmbientLayer";
import { WorldBuilding } from "./WorldBuilding";
import type { BuildingTone } from "./WorldBuilding";
import {
  BUILDINGS,
  BUILDING_ORDER,
  WORLD,
  partnerSpot,
  relationshipPath,
  routePath,
} from "./worldLayout";

export interface WorldScene {
  key: ScenarioKey;
  name: string;
  statusLabel: string;
  tone: BuildingTone;
  /** Absolute index into the trip's encounters, or null if no encounter here. */
  encounterIndex: number | null;
  partnerName: string | null;
  partnerAvatar: string | null;
  /** Met already → eligible for a relationship line + report affordance. */
  done: boolean;
}

export interface WorldMapProps {
  scenes: WorldScene[];
  homeLabel: string;
  plazaLabel: string;
  reduce: boolean;
  onFocusEncounter: (index: number) => void;
}

function PartnerToken({
  scene,
  reduce,
  onFocus,
}: {
  scene: WorldScene;
  reduce: boolean;
  onFocus: (index: number) => void;
}) {
  if (scene.encounterIndex === null) return null;
  const spot = partnerSpot(scene.key);
  const colorVar = BUILDINGS[scene.key].colorVar;
  const faint = scene.tone === "upcoming" || scene.tone === "idle";
  const interactive = !faint;

  return (
    <motion.g
      transform={`translate(${spot.x} ${spot.y})`}
      style={{ cursor: interactive ? "pointer" : "default" }}
      whileHover={interactive && !reduce ? { scale: 1.08 } : undefined}
      onClick={interactive ? () => onFocus(scene.encounterIndex!) : undefined}
    >
      {/* active halo */}
      {scene.tone === "active" && !reduce && (
        <motion.circle
          r={20}
          cy={-7}
          fill="none"
          stroke={colorVar}
          strokeWidth={1.5}
          initial={{ scale: 0.7, opacity: 0.6 }}
          animate={{ scale: [0.7, 1.4], opacity: [0.6, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
      )}
      <Mascot emoji={scene.partnerAvatar} name={scene.partnerName ?? "?"} colorVar={colorVar} radius={12} faint={faint} />

      {/* report-ready badge */}
      {scene.done && (
        <g transform="translate(14 -20)">
          <circle r={6.5} fill="var(--color-journey-returned)" />
          <path d="M -3 0 L -0.8 2.4 L 3 -2.2" fill="none" stroke="#05241a" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}

      {/* name label for met partners */}
      {!faint && scene.partnerName && (
        <g transform="translate(0 26)">
          <rect x={-34} y={-8} width={68} height={16} rx={8} fill="#0b0b14" opacity={0.85} />
          <text textAnchor="middle" dominantBaseline="central" y={0} fontSize={9.5} fill="#ecedf6" fontFamily="Inter, system-ui, sans-serif">
            {scene.partnerName.length > 9 ? `${scene.partnerName.slice(0, 8)}…` : scene.partnerName}
          </text>
        </g>
      )}
    </motion.g>
  );
}

function WorldMapImpl({ scenes, homeLabel, plazaLabel, reduce, onFocusEncounter }: WorldMapProps) {
  const { width, height, home, plaza } = WORLD;
  const sceneByKey = new Map(scenes.map((s) => [s.key, s]));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 h-full w-full select-none"
      role="img"
      aria-label="The living world map"
    >
      <defs>
        <linearGradient id="worldGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--color-world-grass)", stopOpacity: 0.55 }} />
          <stop offset="55%" style={{ stopColor: "var(--color-world-mid)", stopOpacity: 0.35 }} />
          <stop offset="100%" style={{ stopColor: "var(--color-world-deep)", stopOpacity: 0 }} />
        </linearGradient>
        <radialGradient id="worldPlaza" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={{ stopColor: "var(--color-elevated)", stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: "var(--color-surface)", stopOpacity: 0 }} />
        </radialGradient>
        <radialGradient id="worldHome" cx="50%" cy="40%" r="60%">
          <stop offset="0%" style={{ stopColor: "var(--color-accent)", stopOpacity: 0.6 }} />
          <stop offset="100%" style={{ stopColor: "var(--color-world-grass)", stopOpacity: 0.1 }} />
        </radialGradient>
        <filter id="worldSoftBlur" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>

      {/* meadow / horizon */}
      <path
        d={`M -40 ${height * 0.34} Q ${width * 0.5} ${height * 0.24} ${width + 40} ${height * 0.34} L ${width + 40} ${height + 40} L -40 ${height + 40} Z`}
        fill="url(#worldGround)"
      />

      {/* guide-map routes (decorative, dotted) */}
      {BUILDING_ORDER.map((key) => (
        <g key={`route-${key}`} style={{ color: BUILDINGS[key].colorVar }}>
          <path d={routePath(key)} fill="none" stroke="#070a12" strokeWidth={16} strokeLinecap="round" opacity={0.55} />
          <path d={routePath(key)} fill="none" stroke="currentColor" strokeOpacity={0.16} strokeWidth={3} strokeLinecap="round" strokeDasharray="2 13" />
        </g>
      ))}

      {/* relationship lines — only for encounters already met */}
      {scenes
        .filter((s) => s.done)
        .map((s) => (
          <path
            key={`rel-${s.key}`}
            d={relationshipPath(s.key)}
            fill="none"
            stroke={BUILDINGS[s.key].colorVar}
            strokeOpacity={0.4}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeDasharray="1 9"
          />
        ))}

      {/* central plaza */}
      <g transform={`translate(${plaza.x} ${plaza.y})`}>
        <ellipse cx={0} cy={0} rx={104} ry={70} fill="url(#worldPlaza)" />
        <ellipse cx={0} cy={0} rx={78} ry={50} fill="none" stroke="var(--color-border)" strokeOpacity={0.6} strokeWidth={1.2} />
        <circle cx={0} cy={0} r={20} fill="var(--color-surface)" stroke="var(--color-accent)" strokeOpacity={0.45} strokeWidth={1.4} />
        {!reduce && (
          <motion.circle
            cx={0}
            cy={0}
            r={20}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={1.4}
            initial={{ scale: 0.6, opacity: 0.5 }}
            animate={{ scale: [0.6, 1.7], opacity: [0.5, 0] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: "easeOut" }}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
        )}
        <text x={0} y={92} textAnchor="middle" fontSize={11} fill="var(--color-faint)" fontFamily="Inter, system-ui, sans-serif">
          {plazaLabel}
        </text>
      </g>

      {/* ambient life (behind landmarks) */}
      <AmbientLayer reduce={reduce} />

      {/* the frog's home */}
      <g transform={`translate(${home.x} ${home.y})`}>
        <ellipse cx={0} cy={20} rx={86} ry={26} fill="url(#worldHome)" />
        <ellipse cx={0} cy={24} rx={52} ry={13} fill="#000" opacity={0.25} />
        {/* lily-pad mound */}
        <path d="M -46 16 Q -46 -30 0 -30 Q 46 -30 46 16 Z" fill="#13241d" stroke="var(--color-accent)" strokeOpacity={0.5} strokeWidth={1.6} />
        <path d="M -46 16 Q -46 -30 0 -30 Q 46 -30 46 16 Z" fill="var(--color-accent)" opacity={0.08} />
        {/* round door */}
        <circle cx={0} cy={2} r={13} fill="#0b0b14" stroke="var(--color-accent)" strokeOpacity={0.55} strokeWidth={1.5} />
        <text x={0} y={3} textAnchor="middle" dominantBaseline="central" fontSize={13}>
          🪷
        </text>
        {/* little flag */}
        <line x1={34} y1={-26} x2={34} y2={-52} stroke="var(--color-border)" strokeWidth={1.6} />
        <path d="M 34 -52 L 52 -47 L 34 -42 Z" fill="var(--color-accent)" opacity={0.9} />
        <g transform="translate(0 34)">
          <rect x={-26} y={-10} width={52} height={19} rx={9.5} fill="#0b0b14" opacity={0.9} stroke="var(--color-accent)" strokeOpacity={0.45} />
          <text textAnchor="middle" dominantBaseline="central" y={0} fontSize={11} fill="var(--color-ink)" fontWeight={600} fontFamily="Inter, system-ui, sans-serif">
            {homeLabel}
          </text>
        </g>
      </g>

      {/* district landmarks */}
      {BUILDING_ORDER.map((key, i) => {
        const s = sceneByKey.get(key);
        if (!s) return null;
        return (
          <WorldBuilding
            key={`building-${key}`}
            spec={BUILDINGS[key]}
            name={s.name}
            statusLabel={s.statusLabel}
            tone={s.tone}
            phase={i * 0.85}
            reduce={reduce}
          />
        );
      })}

      {/* partners met along the journey */}
      {scenes.map((s) => (
        <PartnerToken key={`partner-${s.key}`} scene={s} reduce={reduce} onFocus={onFocusEncounter} />
      ))}
    </svg>
  );
}

export const WorldMap = memo(WorldMapImpl);
