import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Card } from "../../components/ui/Card";

export interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  const { t } = useTranslation("common");
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-80 w-[42rem] -translate-x-1/2 rounded-full bg-brand/20 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 right-[-6rem] h-72 w-72 rounded-full bg-accent/10 blur-[120px]"
      />

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative w-full max-w-md"
      >
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand to-accent shadow-glow">
              <span className="h-3 w-3 rounded-full bg-white/90" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-ink">{t("brand.name")}</span>
          </Link>
        </div>

        <Card glow className="overflow-hidden">
          <div className="px-7 pt-7">
            <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
            <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
          </div>
          <div className="px-7 pb-7 pt-6">{children}</div>
        </Card>

        <div className="mt-5 text-center text-sm text-muted">{footer}</div>
      </motion.div>
    </div>
  );
}
