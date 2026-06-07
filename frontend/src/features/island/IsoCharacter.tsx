/**
 * A little character (小人) for the 2.5D world — a rounded twin avatar drawn in
 * SVG and animated with a **transform-only walk cycle** (legs swing, arms
 * counter-swing, a soft body bob), so it holds 60fps on the compositor and never
 * forces a React re-render while it moves. Drawn at the origin standing on its
 * feet (local `y = 0` is the ground); the caller positions it with a transform.
 *
 * Used everywhere a twin appears in the world: ambient residents milling about,
 * the partner met at a building, the plaza's present twins, and (the hero) the
 * user's own travelling twin.
 */
import { memo } from "react";
import { motion } from "motion/react";

import { initials } from "../../lib/format";

export type CharacterBubble = "thinking" | "talking" | null;

export interface IsoCharacterProps {
  /** Emoji face; falls back to initials of {@link name}. */
  emoji?: string | null;
  name?: string;
  /** CSS custom-property accent (e.g. `var(--color-scn-cafe)`). */
  color: string;
  /** Run the walk cycle (legs/arms/bob). */
  walking?: boolean;
  /** Mirror to face left (toward travel direction / a partner). */
  faceLeft?: boolean;
  reduce?: boolean;
  /** Relative size of the character. Default 1. */
  scale?: number;
  /** Desync the gait so a crowd doesn't march in lockstep (seconds). */
  phase?: number;
  /** Dim to a "yet to be discovered" silhouette. */
  dimmed?: boolean;
  /** Small thought / speech dots above the head. */
  bubble?: CharacterBubble;
  /** Name pill rendered under the feet. */
  label?: string | null;
}

const STRIDE = 0.48;

function isEmoji(value: string | null | undefined): value is string {
  return !!value && [...value].length <= 2 && !/^[a-z0-9]/i.test(value);
}

function IsoCharacterImpl({
  emoji,
  name = "",
  color,
  walking = false,
  faceLeft = false,
  reduce = false,
  scale = 1,
  phase = 0,
  dimmed = false,
  bubble = null,
  label = null,
}: IsoCharacterProps) {
  const glyph = isEmoji(emoji) ? emoji : null;
  const flip = faceLeft ? -1 : 1;
  const animate = walking && !reduce;

  const legSwing = (lead: boolean) =>
    animate
      ? { rotate: lead ? [22, -22, 22] : [-22, 22, -22] }
      : { rotate: 0 };
  const armSwing = (lead: boolean) =>
    animate
      ? { rotate: lead ? [-16, 16, -16] : [16, -16, 16] }
      : { rotate: 0 };
  const legTransition = { duration: STRIDE, repeat: Infinity, ease: "easeInOut" as const, delay: phase };

  return (
    <g style={{ color }} opacity={dimmed ? 0.4 : 1}>
      {/* ground shadow (tightens while walking) */}
      <motion.ellipse
        cx={0}
        cy={0}
        rx={9 * scale}
        ry={3 * scale}
        fill="#000"
        opacity={0.26}
        animate={animate ? { rx: [9 * scale, 7.5 * scale, 9 * scale] } : { rx: 9 * scale }}
        transition={animate ? legTransition : { duration: 0.2 }}
      />

      {/* body bobs up/down on each stride; mirrored to face travel direction */}
      <motion.g
        transform={`scale(${flip * scale} ${scale})`}
        animate={animate ? { y: [0, -2.4 * scale, 0] } : { y: 0 }}
        transition={animate ? { duration: STRIDE, repeat: Infinity, ease: "easeInOut", delay: phase } : { duration: 0.2 }}
      >
        {/* legs (pivot at the hip) */}
        <motion.g
          style={{ transformBox: "fill-box", transformOrigin: "50% 0%" }}
          transform="translate(-3 0)"
          animate={legSwing(true)}
          transition={legTransition}
        >
          <rect x={-2} y={-11} width={4} height={11} rx={2} fill="currentColor" opacity={0.85} />
        </motion.g>
        <motion.g
          style={{ transformBox: "fill-box", transformOrigin: "50% 0%" }}
          transform="translate(3 0)"
          animate={legSwing(false)}
          transition={legTransition}
        >
          <rect x={-2} y={-11} width={4} height={11} rx={2} fill="currentColor" opacity={0.7} />
        </motion.g>

        {/* back arm (drawn before torso so it tucks behind) */}
        <motion.g
          style={{ transformBox: "fill-box", transformOrigin: "50% 0%" }}
          transform="translate(-6.5 -23)"
          animate={armSwing(false)}
          transition={legTransition}
        >
          <rect x={-1.6} y={0} width={3.2} height={10} rx={1.6} fill="currentColor" opacity={0.55} />
        </motion.g>

        {/* torso — a soft bell in the scene accent */}
        <path d="M -6.5 -11 Q -7.5 -26 0 -26 Q 7.5 -26 6.5 -11 Z" fill="currentColor" opacity={0.95} />
        <path d="M -6.5 -11 Q -7.5 -26 0 -26 Q 7.5 -26 6.5 -11 Z" fill="#06120c" opacity={0.14} />

        {/* front arm */}
        <motion.g
          style={{ transformBox: "fill-box", transformOrigin: "50% 0%" }}
          transform="translate(6.5 -23)"
          animate={armSwing(true)}
          transition={legTransition}
        >
          <rect x={-1.6} y={0} width={3.2} height={10} rx={1.6} fill="currentColor" opacity={0.9} />
        </motion.g>

        {/* head */}
        <circle cx={0} cy={-32} r={8.2} fill="var(--color-surface)" stroke="currentColor" strokeWidth={1.8} />
        {glyph ? (
          <text x={0} y={-31.4} textAnchor="middle" dominantBaseline="central" fontSize={9.4}>
            {glyph}
          </text>
        ) : (
          <text
            x={0}
            y={-31.4}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={6.6}
            fontWeight={700}
            fill="currentColor"
            fontFamily="var(--font-sans)"
          >
            {initials(name)}
          </text>
        )}
      </motion.g>

      {/* thought / speech dots */}
      {bubble && (
        <g transform="translate(11 -42)">
          <rect x={-10} y={-7} width={20} height={14} rx={7} fill="var(--color-surface)" opacity={0.92} stroke="currentColor" strokeOpacity={0.5} strokeWidth={1} />
          {[0, 1, 2].map((i) => (
            <motion.circle
              key={i}
              cx={-5 + i * 5}
              cy={0}
              r={1.7}
              fill="currentColor"
              animate={reduce ? { opacity: 0.7 } : { opacity: [0.3, 1, 0.3] }}
              transition={reduce ? { duration: 0 } : { duration: 1.1, repeat: Infinity, ease: "easeInOut", delay: i * 0.18 }}
            />
          ))}
        </g>
      )}

      {/* name pill */}
      {label && (
        <g transform="translate(0 13)">
          <rect
            x={-Math.max(20, label.length * 4.4 + 8)}
            y={-7.5}
            width={Math.max(40, label.length * 8.8 + 16)}
            height={15}
            rx={7.5}
            fill="var(--color-surface)"
            opacity={0.9}
            stroke="currentColor"
            strokeOpacity={0.4}
            strokeWidth={1}
          />
          <text
            x={0}
            y={0}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={9}
            fill="var(--color-ink)"
            fontFamily="var(--font-sans)"
          >
            {label.length > 8 ? `${label.slice(0, 7)}…` : label}
          </text>
        </g>
      )}
    </g>
  );
}

export const IsoCharacter = memo(IsoCharacterImpl);
