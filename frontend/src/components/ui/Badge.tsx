import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type BadgeTone = "neutral" | "brand" | "accent" | "danger" | "success" | "warning";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-muted ring-1 ring-border/60",
  brand: "bg-brand-soft text-brand ring-1 ring-brand/40",
  accent: "bg-accent/10 text-accent ring-1 ring-accent/30",
  danger: "bg-danger/10 text-danger ring-1 ring-danger/30",
  success: "bg-success/10 text-success ring-1 ring-success/30",
  warning: "bg-warning/10 text-warning ring-1 ring-warning/30",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
