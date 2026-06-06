import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

export interface SpinnerProps {
  className?: string;
  size?: number;
}

export function Spinner({ className, size = 18 }: SpinnerProps) {
  const { t } = useTranslation("common");
  return (
    <span
      role="status"
      aria-label={t("a11y.loading")}
      style={{ width: size, height: size }}
      className={cn(
        "inline-block animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}
