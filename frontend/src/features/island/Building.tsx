import { motion } from "motion/react";
import type { Scenario } from "../../lib/api";
import type { BuildingSpec } from "./islandLayout";

export interface BuildingProps {
  spec: BuildingSpec;
  scenario?: Scenario;
  /** A conversation is currently running here. */
  live?: boolean;
  selected?: boolean;
  /** Float phase offset (seconds) so buildings don't bob in lockstep. */
  phase?: number;
  onSelect?: () => void;
}

export function Building({ spec, scenario, live, selected, phase = 0, onSelect }: BuildingProps) {
  const { color, emoji, zh, pos } = spec;
  const placeholder = scenario ? !scenario.is_full : false;
  const baseOpacity = placeholder ? 0.62 : 1;

  return (
    <g transform={`translate(${pos.x} ${pos.y})`} style={{ cursor: onSelect ? "pointer" : "default" }}>
      <motion.g
        onClick={onSelect}
        initial={{ y: 0 }}
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: phase }}
        whileHover={onSelect ? { scale: 1.04 } : undefined}
        style={{ transformOrigin: "center", opacity: baseOpacity }}
      >
        {/* glow */}
        <circle r={64} cy={-4} fill={color} opacity={live ? 0.24 : 0.1} filter="url(#islandSoftBlur)" />

        {/* hit target */}
        <rect x={-62} y={-80} width={124} height={150} fill="transparent" />

        {/* name pill (above roof) */}
        <g transform="translate(0 -64)">
          <rect
            x={-56}
            y={-10}
            width={112}
            height={20}
            rx={10}
            fill="#0f0f1a"
            opacity={0.92}
            stroke={color}
            strokeWidth={selected ? 1.6 : 0.9}
            strokeOpacity={selected ? 0.9 : 0.5}
          />
          <text x={0} y={1} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="#ecedf6" fontFamily="Inter, system-ui, sans-serif" fontWeight={600}>
            {zh}
            {placeholder ? "  · soon" : ""}
          </text>
        </g>

        {/* roof */}
        <path d="M -58 -16 L -42 -44 L 42 -44 L 58 -16 Z" fill={color} opacity={0.92} />
        <path d="M -58 -16 L -42 -44 L 42 -44 L 58 -16 Z" fill="#000" opacity={0.16} />

        {/* body */}
        <rect x={-50} y={-16} width={100} height={62} rx={9} fill="#13131f" stroke={color} strokeWidth={selected ? 3 : 1.6} />
        <rect x={-50} y={-16} width={100} height={62} rx={9} fill={color} opacity={0.06} />

        {/* windows */}
        <rect x={-38} y={-6} width={16} height={13} rx={3} fill={color} opacity={live ? 0.8 : 0.42} />
        <rect x={22} y={-6} width={16} height={13} rx={3} fill={color} opacity={live ? 0.8 : 0.42} />

        {/* sign disc with emoji (on the body) */}
        <circle cx={0} cy={20} r={15} fill="#0f0f1a" stroke={color} strokeWidth={1.6} />
        <text x={0} y={21} textAnchor="middle" dominantBaseline="central" fontSize={16}>
          {emoji}
        </text>

        {/* live pulse */}
        {live && (
          <motion.circle
            cx={44}
            cy={-30}
            r={5}
            fill="#36d399"
            animate={{ scale: [1, 1.65, 1], opacity: [0.9, 0.2, 0.9] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </motion.g>
    </g>
  );
}
