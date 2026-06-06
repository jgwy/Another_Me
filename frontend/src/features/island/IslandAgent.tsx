import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { ScenarioKey } from "../../lib/api";
import { initials } from "../../lib/format";
import { ISLAND, keyframeTimes, walkPath } from "./islandLayout";

export interface IslandAgentProps {
  name: string;
  avatar?: string | null;
  color: string;
  scenarioKey: ScenarioKey;
  seat: number;
  /** Stagger delay (seconds) so a tableful of twins files in. */
  delay?: number;
  onClick?: () => void;
}

function isEmoji(value: string | null | undefined): value is string {
  return !!value && [...value].length <= 2 && !/^[a-z0-9]/i.test(value);
}

/**
 * An avatar token that walks the dock→table path and sits. Movement is a
 * keyframed transform on nested `<motion.g>` layers (position / bob / sit-pop),
 * so it stays on the compositor at 60fps. Honors reduced-motion by seating
 * instantly.
 */
export function IslandAgent({ name, avatar, color, scenarioKey, seat, delay = 0, onClick }: IslandAgentProps) {
  const reduce = useReducedMotion();
  const [arrived, setArrived] = useState(reduce ?? false);

  const path = walkPath(scenarioKey, seat);
  const seatPt = path[path.length - 1]!;
  const xs = path.map((p) => p.x);
  const ys = path.map((p) => p.y);
  const times = keyframeTimes(path);

  // Distance-based duration → roughly constant walking speed.
  let dist = 0;
  for (let i = 1; i < path.length; i++) {
    dist += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y);
  }
  const duration = Math.min(3, Math.max(1.8, dist / 320));

  const walking = !arrived && !reduce;
  const glyph = isEmoji(avatar) ? avatar : null;

  return (
    <motion.g
      style={{ cursor: onClick ? "pointer" : "default" }}
      initial={reduce ? { x: seatPt.x, y: seatPt.y } : { x: ISLAND.entrance.x, y: ISLAND.entrance.y }}
      animate={reduce ? { x: seatPt.x, y: seatPt.y } : { x: xs, y: ys }}
      transition={reduce ? { duration: 0 } : { duration, times, delay, ease: "easeInOut" }}
      onAnimationComplete={() => setArrived(true)}
      onClick={onClick}
      whileHover={onClick ? { scale: 1.06 } : undefined}
    >
      {/* bob while walking */}
      <motion.g
        animate={{ y: walking ? [0, -3, 0] : 0 }}
        transition={
          walking
            ? { duration: 0.46, repeat: Infinity, ease: "easeInOut" }
            : { type: "spring", stiffness: 300, damping: 18 }
        }
      >
        {/* sit-down pop */}
        <motion.g
          initial={false}
          animate={{ scale: arrived && !reduce ? [0.92, 1.16, 1] : 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          style={{ transformOrigin: "center" }}
        >
          {/* ground shadow */}
          <ellipse cx={0} cy={17} rx={13} ry={4} fill="#000" opacity={0.28} />
          {/* disc */}
          <circle r={16} fill={color} opacity={0.18} />
          <circle r={16} fill="none" stroke={color} strokeWidth={2} />
          <circle r={13} fill="#0f0f1a" />
          {glyph ? (
            <text textAnchor="middle" dominantBaseline="central" fontSize={15} y={1}>
              {glyph}
            </text>
          ) : (
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11}
              y={1}
              fill={color}
              fontWeight={700}
              fontFamily="Inter, system-ui, sans-serif"
            >
              {initials(name)}
            </text>
          )}
        </motion.g>
      </motion.g>

      {/* name label fades in once seated */}
      <motion.g
        initial={false}
        animate={{ opacity: arrived ? 1 : 0, y: arrived ? 0 : -2 }}
        transition={{ duration: 0.3, delay: arrived ? 0.1 : 0 }}
      >
        <rect x={-30} y={24} width={60} height={15} rx={7.5} fill="#0f0f1a" opacity={0.85} />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          x={0}
          y={32}
          fontSize={9}
          fill="#ecedf6"
          fontFamily="Inter, system-ui, sans-serif"
        >
          {name.length > 12 ? `${name.slice(0, 11)}…` : name}
        </text>
      </motion.g>
    </motion.g>
  );
}
