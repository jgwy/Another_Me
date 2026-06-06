import { useTranslation } from "react-i18next";

import { SUPPORTED_LANGUAGES, setLanguage } from "../../i18n";
import type { SupportedLanguage } from "../../i18n";
import { cn } from "../../lib/cn";

export interface LanguageSwitcherProps {
  className?: string;
}

/**
 * Compact segmented control for the two shipped UI languages (zh default, en).
 * Writes the choice through {@link setLanguage} so it persists to localStorage
 * and keeps `<html lang>` in sync.
 */
export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation("nav");
  const current = (i18n.resolvedLanguage ?? i18n.language ?? "zh").slice(0, 2) as SupportedLanguage;

  return (
    <div
      role="group"
      aria-label={t("language.label")}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border/60 bg-surface-2/50 p-0.5",
        className,
      )}
    >
      {SUPPORTED_LANGUAGES.map((lng) => {
        const active = current === lng;
        return (
          <button
            key={lng}
            type="button"
            onClick={() => setLanguage(lng)}
            aria-pressed={active}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              active ? "bg-brand/90 text-white shadow-glow" : "text-muted hover:text-ink",
            )}
          >
            {t(`language.${lng}`)}
          </button>
        );
      })}
    </div>
  );
}
