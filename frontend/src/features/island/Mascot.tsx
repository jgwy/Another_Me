/**
 * A small mascot "person" — rounded head + body with a role emoji and a
 * distinct accent color (per the codex guide-map direction). Drawn at the
 * origin in SVG space; the caller positions it with a `transform`. Used for the
 * resident twins milling about and the partners the frog meets.
 */
import { initials } from "../../lib/format";

export interface MascotProps {
  /** Emoji avatar; falls back to initials of {@link name}. */
  emoji?: string | null;
  name: string;
  /** CSS custom-property accent (e.g. `var(--color-scn-cafe)`). */
  colorVar: string;
  /** Head radius; the body scales from this. Default 13. */
  radius?: number;
  /** Dim to a "yet to be discovered" silhouette. */
  faint?: boolean;
}

function isEmoji(value: string | null | undefined): value is string {
  return !!value && [...value].length <= 2 && !/^[a-z0-9]/i.test(value);
}

export function Mascot({ emoji, name, colorVar, radius = 13, faint = false }: MascotProps) {
  const glyph = isEmoji(emoji) ? emoji : null;
  const headR = radius;
  const bodyW = radius * 1.5;
  const bodyTop = headR * 0.2;
  const bodyBottom = headR * 1.7;

  return (
    <g style={{ color: colorVar }} opacity={faint ? 0.42 : 1}>
      {/* ground shadow */}
      <ellipse cx={0} cy={bodyBottom + 2} rx={bodyW * 0.78} ry={3.5} fill="#000" opacity={0.28} />

      {/* body — a soft bell */}
      <path
        d={`M ${-bodyW} ${bodyBottom} Q ${-bodyW - 1} ${bodyTop} 0 ${bodyTop} Q ${bodyW + 1} ${bodyTop} ${bodyW} ${bodyBottom} Z`}
        fill="currentColor"
        opacity={0.92}
      />
      <path
        d={`M ${-bodyW} ${bodyBottom} Q ${-bodyW - 1} ${bodyTop} 0 ${bodyTop} Q ${bodyW + 1} ${bodyTop} ${bodyW} ${bodyBottom} Z`}
        fill="#05070f"
        opacity={0.16}
      />

      {/* head */}
      <circle cy={-headR * 0.55} r={headR} fill="#0f0f1a" stroke="currentColor" strokeWidth={2} />
      {glyph ? (
        <text textAnchor="middle" dominantBaseline="central" y={-headR * 0.55 + 1} fontSize={headR * 1.05}>
          {glyph}
        </text>
      ) : (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          y={-headR * 0.55 + 1}
          fontSize={headR * 0.72}
          fill="currentColor"
          fontWeight={700}
          fontFamily="Inter, system-ui, sans-serif"
        >
          {initials(name)}
        </text>
      )}
    </g>
  );
}
