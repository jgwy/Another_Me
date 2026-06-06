import { motion } from "motion/react";
import type { Conversation, Scenario, ScenarioKey } from "../../lib/api";
import { Building } from "./Building";
import { IslandAgent } from "./IslandAgent";
import { BUILDING_ORDER, BUILDINGS, roundedPath } from "./islandLayout";

export interface IslandMapProps {
  scenarios: Scenario[];
  conversations: Conversation[];
  selectedKey?: ScenarioKey | null;
  onSelectBuilding: (key: ScenarioKey) => void;
  onOpenConversation: (conversationId: string) => void;
}

const ISLAND_BLOB =
  "M 500 116 C 690 104 858 168 882 312 C 902 426 822 540 632 562 C 470 581 226 566 138 444 C 86 372 96 232 246 156 C 330 114 414 122 500 116 Z";

interface WanderSpec {
  emoji: string;
  color: string;
  pts: [number, number][];
  dur: number;
}

const WANDERERS: WanderSpec[] = [
  { emoji: "🐢", color: "#2dd4a7", pts: [[430, 392], [388, 350], [422, 306], [486, 326], [462, 392], [430, 392]], dur: 19 },
  { emoji: "🦊", color: "#fbbf55", pts: [[566, 300], [616, 332], [604, 392], [544, 404], [524, 348], [566, 300]], dur: 23 },
  { emoji: "🦉", color: "#7c5cff", pts: [[506, 424], [566, 444], [524, 476], [462, 452], [506, 424]], dur: 21 },
];

const FIREFLIES: { x: number; y: number; d: number }[] = [
  { x: 340, y: 260, d: 0 },
  { x: 640, y: 300, d: 1.3 },
  { x: 500, y: 220, d: 0.6 },
  { x: 420, y: 430, d: 2.1 },
  { x: 660, y: 430, d: 1.7 },
];

function Wanderer({ emoji, color, pts, dur }: WanderSpec) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return (
    <motion.g
      initial={{ x: xs[0], y: ys[0] }}
      animate={{ x: xs, y: ys }}
      transition={{ duration: dur, repeat: Infinity, ease: "easeInOut" }}
      opacity={0.78}
    >
      <ellipse cx={0} cy={12} rx={9} ry={3} fill="#000" opacity={0.25} />
      <circle r={11} fill={color} opacity={0.18} />
      <circle r={11} fill="none" stroke={color} strokeWidth={1.4} />
      <circle r={9} fill="#0f0f1a" />
      <text textAnchor="middle" dominantBaseline="central" fontSize={11} y={1}>
        {emoji}
      </text>
    </motion.g>
  );
}

export function IslandMap({
  scenarios,
  conversations,
  selectedKey,
  onSelectBuilding,
  onOpenConversation,
}: IslandMapProps) {
  const byKey = new Map<ScenarioKey, Scenario>();
  scenarios.forEach((s) => byKey.set(s.key, s));
  const scenarioById = new Map<string, Scenario>();
  scenarios.forEach((s) => scenarioById.set(s.id, s));

  const convForKey = (key: ScenarioKey): Conversation | undefined => {
    const candidates = conversations.filter((c) => scenarioById.get(c.scenario_id)?.key === key);
    return candidates.find((c) => c.status === "running") ?? candidates[0];
  };

  return (
    <svg
      viewBox="0 0 1000 640"
      className="h-auto w-full select-none"
      role="img"
      aria-label="The island map with scenario buildings"
    >
      <defs>
        <radialGradient id="islandWater" cx="50%" cy="42%" r="75%">
          <stop offset="0%" stopColor="#0c1a33" />
          <stop offset="60%" stopColor="#081027" />
          <stop offset="100%" stopColor="#05070f" />
        </radialGradient>
        <radialGradient id="islandGrass" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#1b3a30" />
          <stop offset="100%" stopColor="#0f2019" />
        </radialGradient>
        <radialGradient id="islandPlaza" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#26263f" />
          <stop offset="100%" stopColor="#181826" />
        </radialGradient>
        <filter id="islandSoftBlur" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      {/* water */}
      <rect x={0} y={0} width={1000} height={640} fill="url(#islandWater)" />
      {[0, 1, 2].map((i) => (
        <motion.path
          key={`wave-${i}`}
          d={`M -40 ${150 + i * 150} Q 250 ${130 + i * 150} 500 ${150 + i * 150} T 1040 ${150 + i * 150}`}
          fill="none"
          stroke="#2dd4a7"
          strokeWidth={1.5}
          strokeOpacity={0.06}
          initial={{ x: -30 }}
          animate={{ x: [-30, 30, -30] }}
          transition={{ duration: 12 + i * 3, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}

      {/* landmass: shore underlay + grass */}
      <path d={ISLAND_BLOB} fill="#1a2436" transform="translate(0 6)" opacity={0.9} />
      <path d={ISLAND_BLOB} fill="url(#islandGrass)" stroke="#2dd4a7" strokeOpacity={0.16} strokeWidth={2} />

      {/* fireflies */}
      {FIREFLIES.map((f, i) => (
        <motion.circle
          key={`fly-${i}`}
          cx={f.x}
          cy={f.y}
          r={2.2}
          fill="#7cf0cf"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.85, 0], y: [0, -14, 0] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: f.d }}
        />
      ))}

      {/* roads */}
      {BUILDING_ORDER.map((key) => (
        <g key={`road-${key}`}>
          <path d={roundedPath(BUILDINGS[key].approach)} fill="none" stroke="#0b0e18" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
          <path d={roundedPath(BUILDINGS[key].approach)} fill="none" stroke={BUILDINGS[key].color} strokeOpacity={0.18} strokeWidth={3} strokeLinecap="round" strokeDasharray="2 12" />
        </g>
      ))}

      {/* plaza + fountain + dock */}
      <ellipse cx={500} cy={332} rx={92} ry={64} fill="url(#islandPlaza)" stroke="#2a2a45" strokeWidth={1.5} />
      <circle cx={500} cy={332} r={20} fill="#0f1a2a" stroke="#2dd4a7" strokeOpacity={0.4} strokeWidth={1.5} />
      <motion.circle
        cx={500}
        cy={332}
        r={20}
        fill="none"
        stroke="#2dd4a7"
        strokeWidth={1.5}
        initial={{ scale: 0.6, opacity: 0.5 }}
        animate={{ scale: [0.6, 1.4], opacity: [0.5, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeOut" }}
        style={{ transformOrigin: "500px 332px" }}
      />
      {/* dock */}
      <rect x={486} y={560} width={28} height={56} rx={4} fill="#1a2436" stroke="#2a2a45" />
      <text x={500} y={628} textAnchor="middle" fontSize={11} fill="#6c6d8d" fontFamily="Inter, system-ui, sans-serif">
        the dock
      </text>

      {/* ambient wanderers */}
      {WANDERERS.map((w, i) => (
        <Wanderer key={`wander-${i}`} {...w} />
      ))}

      {/* buildings */}
      {BUILDING_ORDER.map((key, i) => {
        const conv = convForKey(key);
        return (
          <Building
            key={`building-${key}`}
            spec={BUILDINGS[key]}
            scenario={byKey.get(key)}
            live={conv?.status === "running"}
            selected={selectedKey === key}
            phase={i * 0.9}
            onSelect={() => onSelectBuilding(key)}
          />
        );
      })}

      {/* tables */}
      {BUILDING_ORDER.map((key) => {
        const b = BUILDINGS[key];
        const conv = convForKey(key);
        const interactive = !!conv;
        return (
          <g
            key={`table-${key}`}
            transform={`translate(${b.table.x} ${b.table.y})`}
            onClick={interactive ? () => onOpenConversation(conv!.id) : undefined}
            style={{ cursor: interactive ? "pointer" : "default" }}
          >
            {conv?.status === "running" && (
              <motion.ellipse
                cx={0}
                cy={0}
                rx={34}
                ry={15}
                fill="none"
                stroke="#36d399"
                strokeWidth={1.5}
                initial={{ scale: 0.8, opacity: 0.6 }}
                animate={{ scale: [0.8, 1.25], opacity: [0.6, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                style={{ transformOrigin: "center" }}
              />
            )}
            <ellipse cx={0} cy={2} rx={30} ry={12} fill="#000" opacity={0.25} />
            <ellipse cx={0} cy={0} rx={30} ry={12} fill="#1d1d31" stroke={b.color} strokeOpacity={0.5} strokeWidth={1.4} />
            {/* seat markers */}
            {b.seats.map((s, si) => (
              <circle key={si} cx={s.x - b.table.x} cy={s.y - b.table.y} r={6} fill="#0f0f1a" stroke={b.color} strokeOpacity={0.4} strokeWidth={1.2} />
            ))}
            {!interactive && (
              <text x={0} y={1} textAnchor="middle" dominantBaseline="central" fontSize={9} fill="#6c6d8d" fontFamily="Inter, system-ui, sans-serif">
                open
              </text>
            )}
          </g>
        );
      })}

      {/* seated / arriving agents */}
      {BUILDING_ORDER.map((key) => {
        const b = BUILDINGS[key];
        const conv = convForKey(key);
        if (!conv) return null;
        return (
          <g key={`agents-${key}`}>
            {conv.participants.map((p, i) => (
              <IslandAgent
                key={p.id}
                name={p.agent.name}
                avatar={p.agent.avatar}
                color={b.color}
                scenarioKey={key}
                seat={p.seat}
                delay={0.25 + i * 0.55}
                onClick={() => onOpenConversation(conv.id)}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
