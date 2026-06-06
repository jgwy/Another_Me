import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const baseClasses =
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium " +
  "transition-[transform,background-color,box-shadow,border-color,color] duration-150 ease-out " +
  "active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 " +
  "disabled:pointer-events-none disabled:opacity-55";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white shadow-glow hover:bg-brand-strong",
  secondary:
    "border border-border/80 bg-surface-2/70 text-ink hover:border-border hover:bg-elevated",
  ghost: "text-muted hover:bg-surface-2/70 hover:text-ink",
  danger:
    "bg-danger/90 text-white hover:bg-danger",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-4.5 text-sm",
  lg: "h-12 px-6 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, leftIcon, rightIcon, className, children, disabled, type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled || loading}
      className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
      {...props}
    >
      {loading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {!loading && leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});
