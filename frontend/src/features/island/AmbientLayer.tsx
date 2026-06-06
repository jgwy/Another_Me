/**
 * The world's ambient life: resident twins wandering small loops and fireflies
 * drifting overhead. Memoized and independent of the journey tick, so it never
 * re-renders while the frog animates — its Motion loops run straight on the
 * compositor (transform/opacity only, 60fps). Honors reduced motion by holding
 * everyone still.
 */
import { memo } from "react";
import { motion } from "motion/react";

import { wander, bob } from "../../lib/anim";
import { FIREFLIES, RESIDENTS } from "./ambient";
import { Mascot } from "./Mascot";

export interface AmbientLayerProps {
  reduce: boolean;
}

function AmbientLayerImpl({ reduce }: AmbientLayerProps) {
  return (
    <g aria-hidden>
      {/* fireflies */}
      {FIREFLIES.map((f, i) => (
        <motion.circle
          key={`fly-${i}`}
          cx={f.x}
          cy={f.y}
          r={f.r}
          fill="#7cf0cf"
          initial={{ opacity: reduce ? 0.4 : 0 }}
          animate={reduce ? { opacity: 0.4 } : { opacity: [0, 0.9, 0], y: [0, -16, 0] }}
          transition={reduce ? { duration: 0 } : bob(f.dur, f.delay)}
          style={{ filter: "drop-shadow(0 0 4px #2dd4a7)" }}
        />
      ))}

      {/* resident twins */}
      {RESIDENTS.map((r) => {
        const xs = r.loop.map((p) => p.x);
        const ys = r.loop.map((p) => p.y);
        return (
          <motion.g
            key={r.id}
            initial={{ x: xs[0], y: ys[0] }}
            animate={reduce ? { x: xs[0], y: ys[0] } : { x: [...xs, xs[0]!], y: [...ys, ys[0]!] }}
            transition={reduce ? { duration: 0 } : wander(r.dur, r.delay)}
            style={{ scale: r.scale }}
          >
            <Mascot emoji={r.emoji} name={r.id} colorVar={r.colorVar} radius={11} />
          </motion.g>
        );
      })}
    </g>
  );
}

export const AmbientLayer = memo(AmbientLayerImpl);
