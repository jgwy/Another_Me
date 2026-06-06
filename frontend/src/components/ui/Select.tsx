import { forwardRef, useId } from "react";
import type { SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, placeholder, id, className, ...props },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const describedBy = error || hint ? `${selectId}-desc` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-xs font-medium tracking-wide text-muted">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "h-11 w-full appearance-none rounded-xl border bg-surface-2/60 pl-3.5 pr-10 text-sm text-ink",
            "transition-[border-color,box-shadow,background-color] duration-150",
            "outline-none focus:bg-surface-2/90 focus:ring-2",
            error
              ? "border-danger/70 focus:border-danger focus:ring-danger/30"
              : "border-border/70 focus:border-brand focus:ring-brand/35",
            className,
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-faint">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
      {(error || hint) && (
        <span id={describedBy} className={cn("text-xs", error ? "text-danger" : "text-faint")}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
});
