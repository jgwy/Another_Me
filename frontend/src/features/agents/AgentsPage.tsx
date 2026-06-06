/**
 * The agent gallery (R1). Searchable + tag-filterable grid of twins with an
 * "owned by me" toggle. Cards stagger in on mount and animate with `layout`
 * as filters change; loading and empty states are always handled.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { AgentListParams } from "../../lib/api";
import { useAgents } from "../../lib/queries";
import { staggerContainer, spring } from "../../lib/anim";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { AgentCard } from "./AgentCard";

const SearchIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
    <path d="m20 20-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

function GallerySkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-3.5">
            <Skeleton className="h-11 w-11 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <Skeleton className="h-10 w-full" />
          <div className="flex gap-1.5">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function AgentsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation("agents");

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [ownedByMe, setOwnedByMe] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 250);
    return () => clearTimeout(t);
  }, [qInput]);

  const params = useMemo<AgentListParams>(() => {
    const p: AgentListParams = {};
    if (q) p.q = q;
    if (selectedTags.length) p.tags = selectedTags.join(",");
    if (ownedByMe) p.owner = "me";
    return p;
  }, [q, selectedTags, ownedByMe]);

  const { data, isLoading } = useAgents(params);
  const allAgents = useAgents();

  const tagUniverse = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of allAgents.data?.items ?? []) {
      for (const tag of a.profile_tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([tag]) => tag);
  }, [allAgents.data]);

  const toggleTag = (tag: string) =>
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  const hasFilters = Boolean(q || selectedTags.length || ownedByMe);
  const clearFilters = () => {
    setQInput("");
    setQ("");
    setSelectedTags([]);
    setOwnedByMe(false);
  };

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={t("list.eyebrow")}
        title={t("list.title")}
        description={t("list.description")}
        actions={
          <Button onClick={() => navigate("/agents/new")} leftIcon={<span aria-hidden>＋</span>}>
            {t("list.build")}
          </Button>
        }
      />

      <Card glass className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input
              leftIcon={SearchIcon}
              placeholder={t("list.searchPlaceholder")}
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => setOwnedByMe((v) => !v)}
            aria-pressed={ownedByMe}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors",
              ownedByMe
                ? "bg-brand text-white"
                : "bg-surface-2/70 text-muted ring-1 ring-border/60 hover:text-ink",
            )}
          >
            <span aria-hidden>{ownedByMe ? "★" : "☆"}</span>
            {t("list.ownedByMe")}
          </button>
        </div>

        {tagUniverse.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {tagUniverse.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <motion.button
                  key={tag}
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  transition={spring.snappy}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "bg-brand text-white"
                      : "bg-surface-2/70 text-muted ring-1 ring-border/50 hover:text-ink",
                  )}
                >
                  {tag}
                </motion.button>
              );
            })}
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="ml-1 text-xs text-faint underline-offset-2 transition-colors hover:text-ink hover:underline"
              >
                {t("list.clear")}
              </button>
            )}
          </div>
        )}
      </Card>

      {isLoading ? (
        <GallerySkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<span>🛰️</span>}
          title={hasFilters ? t("list.empty.filteredTitle") : t("list.empty.title")}
          description={
            hasFilters ? t("list.empty.filteredDescription") : t("list.empty.description")
          }
          action={
            hasFilters ? (
              <Button variant="secondary" onClick={clearFilters}>
                {t("list.empty.clearFilters")}
              </Button>
            ) : (
              <Button onClick={() => navigate("/agents/new")}>{t("list.build")}</Button>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <span className="text-xs text-faint">{t("list.count", { count: items.length })}</span>
          <motion.div
            variants={staggerContainer(0.05)}
            initial="hidden"
            animate="show"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <AnimatePresence mode="popLayout">
              {items.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </div>
  );
}
