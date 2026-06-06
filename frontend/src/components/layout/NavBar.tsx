import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { cn } from "../../lib/cn";
import { initials } from "../../lib/format";
import { useAuthStore } from "../../store/auth";
import { useDemoMode, useUnreadCount } from "../../lib/queries";
import { Button } from "../ui/Button";
import { LanguageSwitcher } from "./LanguageSwitcher";

const NAV_ITEMS: { key: string; to: string }[] = [
  { key: "island", to: "/" },
  { key: "agents", to: "/agents" },
  { key: "activity", to: "/conversations" },
  { key: "relationships", to: "/relationships" },
  { key: "sandbox", to: "/sandbox" },
  { key: "marketplace", to: "/marketplace" },
];

function isActive(pathname: string, to: string): boolean {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InboxLink() {
  const { pathname } = useLocation();
  const { t } = useTranslation("nav");
  const { data } = useUnreadCount();
  const count = data?.count ?? 0;
  const active = isActive(pathname, "/inbox");
  return (
    <Link
      to="/inbox"
      aria-label={t("items.inbox")}
      title={t("items.inbox")}
      className={cn(
        "relative grid h-9 w-9 place-items-center rounded-lg transition-colors",
        active ? "bg-surface-2/70 text-ink" : "text-muted hover:bg-surface-2/50 hover:text-ink",
      )}
    >
      <MailIcon />
      {count > 0 && (
        <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center">
          <span className="absolute h-2.5 w-2.5 rounded-full bg-danger/60 motion-safe:animate-ping" />
          <span className="relative grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[0.6rem] font-semibold leading-none text-white ring-2 ring-surface">
            {count > 9 ? "9+" : count}
          </span>
        </span>
      )}
    </Link>
  );
}

export function NavBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useTranslation(["nav", "common"]);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const demo = useDemoMode();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="glass sticky top-0 z-40 border-x-0 border-t-0 border-b border-border/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-7">
          <Link to="/" className="group flex items-center gap-2.5">
            <span className="relative grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand to-accent shadow-glow">
              <span className="h-2.5 w-2.5 rounded-full bg-white/90 transition-transform duration-300 group-hover:scale-125" />
            </span>
            <span className="bg-gradient-to-r from-ink to-muted bg-clip-text text-base font-semibold tracking-tight text-transparent">
              {t("common:brand.name")}
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm transition-colors",
                  isActive(pathname, item.to)
                    ? "bg-surface-2/70 text-ink"
                    : "text-muted hover:bg-surface-2/50 hover:text-ink",
                )}
              >
                {t(`nav:items.${item.key}`)}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {demo && (
            <span
              className="hidden rounded-full bg-warning/10 px-2.5 py-1 text-xs text-warning ring-1 ring-warning/30 sm:inline"
              title={t("common:demo.tooltip")}
            >
              {t("common:demo.badge")}
            </span>
          )}
          {isAuthenticated && <InboxLink />}
          <LanguageSwitcher className="hidden sm:inline-flex" />
          <Button variant="primary" size="sm" onClick={() => navigate("/agents/new")} className="hidden sm:inline-flex">
            {t("nav:cta.buildTwin")}
          </Button>
          {isAuthenticated && user ? (
            <>
              <div className="hidden text-right leading-tight sm:block">
                <div className="text-sm font-medium text-ink">{user.username}</div>
                <div className="text-xs text-faint">{t("common:auth.points", { count: user.points })}</div>
              </div>
              <div
                className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand ring-1 ring-brand/40"
                title={user.username}
              >
                {initials(user.username)}
              </div>
              <Button variant="secondary" size="sm" onClick={handleLogout}>
                {t("common:auth.signOut")}
              </Button>
            </>
          ) : (
            <Button variant="primary" size="sm" onClick={() => navigate("/login")}>
              {t("common:auth.signIn")}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
