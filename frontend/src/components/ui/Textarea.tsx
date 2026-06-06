import { forwardRef, useId } from "react";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, id, className, rows = 4, ...props },
  ref,
) {
  const autoId = useId();
  const textareaId = id ?? autoId;
  const describedBy = error || hint ? `${textareaId}-desc` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={textareaId} className="text-xs font-medium tracking-wide text-muted">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "w-full resize-y rounded-xl border bg-surface-2/60 px-3.5 py-2.5 text-sm text-ink",
          "placeholder:text-faint transition-[border-color,box-shadow,background-color] duration-150",
          "outline-none focus:bg-surface-2/90 focus:ring-2",
          error
            ? "border-danger/70 focus:border-danger focus:ring-danger/30"
            : "border-border/70 focus:border-brand focus:ring-brand/35",
          className,
        )}
        {...props}
      />
      {(error || hint) && (
        <span id={describedBy} className={cn("text-xs", error ? "text-danger" : "text-faint")}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
});
