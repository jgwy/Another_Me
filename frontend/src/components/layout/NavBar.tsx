import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "../../lib/cn";
import { initials } from "../../lib/format";
import { useAuthStore } from "../../store/auth";
import { useDemoMode } from "../../lib/queries";
import { Button } from "../ui/Button";

const NAV_ITEMS: { label: string; to: string }[] = [
  { label: "Island", to: "/" },
  { label: "Agents", to: "/agents" },
  { label: "Activity", to: "/conversations" },
  { label: "Marketplace", to: "/marketplace" },
];

function isActive(pathname: string, to: string): boolean {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}

export function NavBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
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
              Another&nbsp;Me
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
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {demo && (
            <span
              className="hidden rounded-full bg-warning/10 px-2.5 py-1 text-xs text-warning ring-1 ring-warning/30 sm:inline"
              title="Live endpoints aren't ready yet — showing typed mock data."
            >
              demo data
            </span>
          )}
          <Button variant="primary" size="sm" onClick={() => navigate("/agents/new")} className="hidden sm:inline-flex">
            Build a twin
          </Button>
          {isAuthenticated && user ? (
            <>
              <div className="hidden text-right leading-tight sm:block">
                <div className="text-sm font-medium text-ink">{user.username}</div>
                <div className="text-xs text-faint">{user.points} pts</div>
              </div>
              <div
                className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand ring-1 ring-brand/40"
                title={user.username}
              >
                {initials(user.username)}
              </div>
              <Button variant="secondary" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </>
          ) : (
            <Button variant="primary" size="sm" onClick={() => navigate("/login")}>
              Sign in
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
