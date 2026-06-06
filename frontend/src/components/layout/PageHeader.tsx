import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { spring } from "../../lib/anim";

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  /** Optional back link shown above the title. */
  backTo?: string;
  backLabel?: string;
  className?: string;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  backTo,
  backLabel,
  className,
}: PageHeaderProps) {
  const { t } = useTranslation("common");
  const resolvedBackLabel = backLabel ?? t("actions.back");
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}
    >
      <div className="flex flex-col gap-1.5">
        {backTo && (
          <Link
            to={backTo}
            className="inline-flex w-fit items-center gap-1 text-xs text-muted transition-colors hover:text-ink"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {resolvedBackLabel}
          </Link>
        )}
        {eyebrow && (
          <span className="text-xs font-medium uppercase tracking-wider text-faint">{eyebrow}</span>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </motion.div>
  );
}
