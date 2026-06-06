import { cn } from "../../lib/cn";

export interface SpinnerProps {
  className?: string;
  size?: number;
}

export function Spinner({ className, size = 18 }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{ width: size, height: size }}
      className={cn(
        "inline-block animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}
