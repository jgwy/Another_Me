import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Frosted translucent surface (default). Set false for a solid surface. */
  glass?: boolean;
  /** Render a subtle gradient hairline ring for emphasis. */
  glow?: boolean;
}

export function Card({ glass = true, glow = false, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl shadow-soft",
        glass ? "glass" : "border border-border/70 bg-surface",
        glow && "ring-gradient",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col gap-1 px-6 pt-6", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-base font-semibold tracking-tight text-ink", className)} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({ className, children, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-sm text-muted", className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-6 py-5", className)} {...props}>
      {children}
    </div>
  );
}
