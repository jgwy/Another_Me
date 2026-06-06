import { cn } from "../../lib/cn";
import { hashIndex, initials } from "../../lib/format";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizeMap: Record<AvatarSize, string> = {
  xs: "h-7 w-7 text-sm",
  sm: "h-9 w-9 text-base",
  md: "h-11 w-11 text-lg",
  lg: "h-14 w-14 text-2xl",
  xl: "h-20 w-20 text-4xl",
};

const palette = [
  "from-brand/30 to-brand/[0.06] text-brand ring-brand/40",
  "from-accent/30 to-accent/[0.06] text-accent ring-accent/40",
  "from-warning/30 to-warning/[0.06] text-warning ring-warning/40",
  "from-danger/30 to-danger/[0.06] text-danger ring-danger/40",
  "from-sky-400/30 to-sky-400/[0.06] text-sky-300 ring-sky-400/40",
  "from-fuchsia-400/30 to-fuchsia-400/[0.06] text-fuchsia-300 ring-fuchsia-400/40",
];

export interface AvatarProps {
  name: string;
  avatar?: string | null;
  size?: AvatarSize;
  className?: string;
}

function isUrl(value: string): boolean {
  return /^https?:\/\//.test(value);
}

export function Avatar({ name, avatar, size = "md", className }: AvatarProps) {
  const tone = palette[hashIndex(name, palette.length)]!;

  if (avatar && isUrl(avatar)) {
    return (
      <img
        src={avatar}
        alt={name}
        className={cn("rounded-full object-cover ring-1 ring-border/60", sizeMap[size], className)}
      />
    );
  }

  return (
    <span
      className={cn(
        "relative grid select-none place-items-center rounded-full bg-gradient-to-br ring-1",
        sizeMap[size],
        tone,
        className,
      )}
      aria-label={name}
    >
      {avatar ? <span aria-hidden>{avatar}</span> : <span className="font-semibold">{initials(name)}</span>}
    </span>
  );
}
