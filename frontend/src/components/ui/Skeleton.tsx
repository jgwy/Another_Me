import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

/** Pulsing placeholder block. Compose freely for list / card skeletons. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-surface-2/80", className)}
      aria-hidden
      {...props}
    />
  );
}
