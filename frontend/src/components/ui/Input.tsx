import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leftIcon, id, className, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error || hint ? `${inputId}-desc` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium tracking-wide text-muted">
          {label}
        </label>
      )}

      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "h-11 w-full rounded-xl border bg-surface-2/60 px-3.5 text-sm text-ink",
            "placeholder:text-faint transition-[border-color,box-shadow,background-color] duration-150",
            "outline-none focus:bg-surface-2/90 focus:ring-2",
            error
              ? "border-danger/70 focus:border-danger focus:ring-danger/30"
              : "border-border/70 focus:border-brand focus:ring-brand/35",
            !!leftIcon && "pl-10",
            className,
          )}
          {...props}
        />
      </div>

      {(error || hint) && (
        <span id={describedBy} className={cn("text-xs", error ? "text-danger" : "text-faint")}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
});
