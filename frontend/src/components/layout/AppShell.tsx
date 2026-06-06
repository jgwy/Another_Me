import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { NavBar } from "./NavBar";

export function AppShell() {
  const { t } = useTranslation("common");
  return (
    <div className="flex min-h-dvh flex-col">
      <NavBar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>

      <footer className="border-t border-border/50">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-faint sm:flex-row sm:px-6">
          <span>{t("footer.tagline")}</span>
          <span className="font-mono">{t("brand.version")}</span>
        </div>
      </footer>
    </div>
  );
}
