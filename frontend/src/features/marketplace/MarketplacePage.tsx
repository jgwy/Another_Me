import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { Tabs } from "../../components/ui/Tabs";
import { spring, staggerContainer } from "../../lib/anim";
import { cn } from "../../lib/cn";
import { MarketplaceCard } from "./MarketplaceCard";
import { PublishModal } from "./PublishModal";
import { UploadModal } from "./UploadModal";
import { VersionsModal } from "./VersionsModal";

const KIND_FILTERS = [
  { value: "all", labelKey: "filters.all", tabKey: "tabs.all" },
  { value: "agent", labelKey: "filters.agents", tabKey: "tabs.agents" },
  { value: "skill", labelKey: "filters.skills", tabKey: "tabs.skills" },
] as const;

const SORTS = [
  { value: "downloads", labelKey: "filters.popular" },
  { value: "recent", labelKey: "filters.new" },
  { value: "likes", labelKey: "filters.liked" },
] as const;

type KindFilter = "all" | MarketplaceKind;
type SortKey = (typeof SORTS)[number]["value"];

type Notice =
  | { tone: "success"; title: string; price: number; kind: MarketplaceKind; sourceVersion?: number | null }
  | { tone: "info"; message: string }
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
  const { t } = useTranslation(["marketplace", "common"]);
  const demo = useDemoMode();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 300);
  const [kind, setKind] = useState<KindFilter>("all");
  const [sort, setSort] = useState<SortKey>("downloads");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [forkingId, setForkingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [versionsItem, setVersionsItem] = useState<MarketplaceItem | null>(null);
  const [publishItem, setPublishItem] = useState<MarketplaceItem | null>(null);

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
        sourceVersion: result.source_version,
      });
    } catch (err) {
      setNotice({
        tone: "danger",
        message: err instanceof ApiError ? err.detail : t("notice.forkError"),
      });
    } finally {
      setForkingId(null);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setKind("all");
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t("page.title")}
        eyebrow={t("page.eyebrow")}
        description={t("page.description")}
        actions={
          <>
            {demo && <Badge tone="warning">{t("common:demo.badge")}</Badge>}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-surface-2/60 px-3 py-1.5 text-sm font-medium text-ink">
              <span aria-hidden className="text-brand">
                ⟡
              </span>
              {t("pts", { value: pointsQuery.isLoading ? "…" : points.toLocaleString() })}
            </span>
            <Button onClick={() => setUploadOpen(true)} leftIcon={<PlusIcon />}>
              {t("page.list")}
            </Button>
          </>
        }
      />

      <AnimatePresence>
        {notice && (
          <motion.div
            key={"message" in notice ? `${notice.tone}-${notice.message}` : `s-${notice.title}`}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={spring.soft}
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm",
              notice.tone === "danger"
                ? "border-danger/40 bg-danger/10 text-danger"
                : "border-accent/30 bg-accent/10 text-accent",
            )}
          >
            {notice.tone === "success" ? (
              <>
                <span>
                  {notice.price === 0
                    ? t("notice.forkedFree", {
                        title: notice.title,
                        destination:
                          notice.kind === "agent" ? t("notice.toAgents") : t("notice.toSkills"),
                      })
                    : t("notice.forkedPaid", {
                        title: notice.title,
                        price: notice.price.toLocaleString(),
                        destination:
                          notice.kind === "agent" ? t("notice.toAgents") : t("notice.toSkills"),
                      })}
                  {notice.sourceVersion != null &&
                    ` ${t("notice.fromVersion", { version: notice.sourceVersion })}`}
                </span>
                {notice.kind === "agent" && (
                  <Link
                    to="/agents"
                    className="shrink-0 font-medium underline-offset-2 hover:underline"
                  >
                    {t("notice.viewAgents")}
                  </Link>
                )}
              </>
            ) : (
              <span>{notice.message}</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dual marketplace: Agent market ↔ Skill market */}
      <Tabs
        tabs={KIND_FILTERS.map((o) => ({ id: o.value, label: t(o.tabKey) }))}
        value={kind}
        onChange={(id) => setKind(id as KindFilter)}
        layoutId="market-kind"
      />

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="sm:max-w-xs sm:flex-1">
          <Input
            leftIcon={<SearchIcon />}
            placeholder={t("filters.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t("filters.searchAria")}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={sort}
            onChange={(v) => setSort(v)}
            options={SORTS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
          />
        </div>
      </div>

      {/* Results */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">
            {isLoading ? t("common:actions.loading") : t("results.count", { count: total })}
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
            title={t("results.emptyTitle")}
            description={hasFilters ? t("results.emptyFiltered") : t("results.empty")}
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  {t("results.clearFilters")}
                </Button>
              ) : (
                <Button onClick={() => setUploadOpen(true)} leftIcon={<PlusIcon />}>
                  {t("page.list")}
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
                  onViewVersions={setVersionsItem}
                  onPublish={setPublishItem}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </section>

      {/* Dispatch is now autonomous — point owners at the trip flow. */}
      <section>
        <Card
          glow
          className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-2xl">
              🧭
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold tracking-tight text-ink">
                {t("dispatchCta.title")}
              </h2>
              <p className="max-w-xl text-sm text-muted">{t("dispatchCta.description")}</p>
            </div>
          </div>
          <Button onClick={() => navigate("/dispatch")} rightIcon={<ArrowRightIcon />} className="shrink-0">
            {t("dispatchCta.action")}
          </Button>
        </Card>
      </section>

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        initialKind={kind === "skill" ? "skill" : "agent"}
      />
      <VersionsModal
        item={versionsItem}
        open={versionsItem != null}
        onClose={() => setVersionsItem(null)}
      />
      <PublishModal
        item={publishItem}
        open={publishItem != null}
        onClose={() => setPublishItem(null)}
        onPublished={(version) => setNotice({ tone: "info", message: t("publish.success", { version }) })}
      />
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

function ArrowRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12h14m0 0-6-6m6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
