import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../../lib/api";
import type { MarketplaceItem, MarketplaceKind, MarketplaceListParams } from "../../lib/api";
import {
  useDemoMode,
  useForkMarketplaceItem,
  useMarketplace,
  usePoints,
} from "../../lib/queries";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Input } from "../../components/ui/Input";
import { Skeleton } from "../../components/ui/Skeleton";
import { Spinner } from "../../components/ui/Spinner";
import { spring, staggerContainer } from "../../lib/anim";
import { cn } from "../../lib/cn";
import { MarketplaceCard } from "./MarketplaceCard";
import { UploadModal } from "./UploadModal";

const KIND_FILTERS = [
  { value: "all", label: "All" },
  { value: "agent", label: "Agents" },
  { value: "skill", label: "Skills" },
] as const;

const SORTS = [
  { value: "downloads", label: "Popular" },
  { value: "recent", label: "New" },
] as const;

type KindFilter = "all" | MarketplaceKind;
type SortKey = (typeof SORTS)[number]["value"];

type Notice =
  | { tone: "success"; title: string; price: number; kind: MarketplaceKind }
  | { tone: "danger"; message: string };

/** Debounce a fast-changing value so search doesn't refetch on every keystroke. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function MarketplacePage() {
  const navigate = useNavigate();
  const demo = useDemoMode();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 300);
  const [kind, setKind] = useState<KindFilter>("all");
  const [sort, setSort] = useState<SortKey>("downloads");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [forkingId, setForkingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [opponentId, setOpponentId] = useState("");

  const params: MarketplaceListParams = {
    q: debouncedSearch.trim() || undefined,
    kind: kind === "all" ? undefined : kind,
    sort,
  };
  const { data, isLoading, isFetching } = useMarketplace(params);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const pointsQuery = usePoints();
  const points = pointsQuery.data?.points ?? 0;

  const fork = useForkMarketplaceItem();

  const hasFilters = Boolean(debouncedSearch.trim()) || kind !== "all";

  // Auto-dismiss the fork result banner.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  const handleFork = async (item: MarketplaceItem) => {
    setForkingId(item.id);
    try {
      const result = await fork.mutateAsync(item.id);
      setNotice({
        tone: "success",
        title: result.item.title,
        price: result.item.price_points,
        kind: result.item.kind,
      });
    } catch (err) {
      setNotice({
        tone: "danger",
        message: err instanceof ApiError ? err.detail : "Could not fork this item.",
      });
    } finally {
      setForkingId(null);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setKind("all");
  };

  const connectById = () => {
    const id = opponentId.trim();
    if (!id) return;
    navigate(`/dispatch?opponent=${encodeURIComponent(id)}`);
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Marketplace"
        eyebrow="Island marketplace"
        description="Browse, fork, and list AI twins and skills. The points economy is simulated — no real payment."
        actions={
          <>
            {demo && <Badge tone="warning">Demo data</Badge>}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-surface-2/60 px-3 py-1.5 text-sm font-medium text-ink">
              <span aria-hidden className="text-brand">
                ⟡
              </span>
              {pointsQuery.isLoading ? "…" : points.toLocaleString()} pts
            </span>
            <Button onClick={() => setUploadOpen(true)} leftIcon={<PlusIcon />}>
              List something
            </Button>
          </>
        }
      />

      <AnimatePresence>
        {notice && (
          <motion.div
            key={notice.tone === "success" ? `s-${notice.title}` : `e-${notice.message}`}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={spring.soft}
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm",
              notice.tone === "success"
                ? "border-accent/30 bg-accent/10 text-accent"
                : "border-danger/40 bg-danger/10 text-danger",
            )}
          >
            {notice.tone === "success" ? (
              <>
                <span>
                  Forked <span className="font-semibold">{notice.title}</span> —{" "}
                  {notice.price === 0 ? "free" : `${notice.price} pts spent`}.{" "}
                  {notice.kind === "agent" ? "Now in your agents." : "Added to your skills."}
                </span>
                {notice.kind === "agent" && (
                  <Link
                    to="/agents"
                    className="shrink-0 font-medium underline-offset-2 hover:underline"
                  >
                    View agents →
                  </Link>
                )}
              </>
            ) : (
              <span>{notice.message}</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="sm:max-w-xs sm:flex-1">
          <Input
            leftIcon={<SearchIcon />}
            placeholder="Search the market…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search marketplace"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={kind} onChange={(v) => setKind(v)} options={KIND_FILTERS} />
          <Segmented value={sort} onChange={(v) => setSort(v)} options={SORTS} />
        </div>
      </div>

      {/* Results */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">
            {isLoading ? "Loading…" : `${total} ${total === 1 ? "listing" : "listings"}`}
          </p>
          {isFetching && !isLoading && <Spinner size={16} className="text-faint" />}
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="flex flex-col gap-4 p-5">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <div className="flex items-center justify-between pt-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-9 w-20 rounded-xl" />
                </div>
              </Card>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon="🛍️"
            title="No listings found"
            description={
              hasFilters
                ? "Try a different search or filter."
                : "Be the first to list an agent or skill on the island."
            }
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button onClick={() => setUploadOpen(true)} leftIcon={<PlusIcon />}>
                  List something
                </Button>
              )
            }
          />
        ) : (
          <motion.div
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            variants={staggerContainer(0.05)}
            initial="hidden"
            animate="show"
          >
            <AnimatePresence mode="popLayout">
              {items.map((item) => (
                <MarketplaceCard
                  key={item.id}
                  item={item}
                  onFork={handleFork}
                  forking={forkingId === item.id}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </section>

      {/* Find an opponent (R6 matching entry points) */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink">Find an opponent</h2>
          <p className="text-sm text-muted">Send your twin into a scenario against another agent.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="flex flex-col gap-3 p-5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-xl">
              🎯
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-semibold tracking-tight text-ink">
                Smart match by profile
              </h3>
              <p className="text-sm text-muted">
                Let the island pair your twin with a compatible opponent from matching profile tags.
              </p>
            </div>
            <div className="mt-1">
              <Button variant="secondary" onClick={() => navigate("/dispatch")}>
                Find a match
              </Button>
            </div>
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-xl">
              🔗
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-semibold tracking-tight text-ink">Connect by Agent ID</h3>
              <p className="text-sm text-muted">
                Already know who you want to face? Paste their agent ID to challenge them directly.
              </p>
            </div>
            <div className="mt-1 flex items-start gap-2">
              <div className="flex-1">
                <Input
                  value={opponentId}
                  onChange={(e) => setOpponentId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") connectById();
                  }}
                  placeholder="agent-id…"
                  aria-label="Opponent agent ID"
                />
              </div>
              <Button onClick={connectById} disabled={!opponentId.trim()}>
                Connect
              </Button>
            </div>
          </Card>
        </div>
      </section>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-xl border border-border/70 bg-surface-2/40 p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            value === opt.value ? "bg-brand text-white shadow-glow" : "text-muted hover:text-ink",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
