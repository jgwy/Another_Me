import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { MarketplaceItem } from "../../lib/api";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { useLikeMarketplaceItem } from "../../lib/queries";
import { useAuthStore } from "../../store/auth";
import { spring, fadeUp } from "../../lib/anim";
import { timeAgo, truncate } from "../../lib/format";
import { cn } from "../../lib/cn";

export interface MarketplaceCardProps {
  item: MarketplaceItem;
  onFork: (item: MarketplaceItem) => void;
  forking?: boolean;
  /** Open the listing's version-history modal. */
  onViewVersions: (item: MarketplaceItem) => void;
  /** Open the publish-new-version modal (owner only). */
  onPublish: (item: MarketplaceItem) => void;
}

/**
 * A single marketplace listing (v2: versioned + social). Surfaces likes (a live
 * toggle), forks, views, a version badge, and the fork-mode indicator, plus the
 * fork/versions/publish actions. v2 fields are optional — every read guards with
 * a `??` fallback so legacy listings render cleanly.
 */
export function MarketplaceCard({
  item,
  onFork,
  forking = false,
  onViewVersions,
  onPublish,
}: MarketplaceCardProps) {
  const { t } = useTranslation("marketplace");
  const reduce = useReducedMotion() ?? false;
  const currentUserId = useAuthStore((s) => s.user?.id);
  const like = useLikeMarketplaceItem();

  const isAgent = item.kind === "agent";
  const free = item.price_points === 0;
  const isOwner = currentUserId != null && currentUserId === item.owner_id;

  // v2 fields are optional; guard every read for legacy listings.
  const version = item.version ?? 1;
  const showVersion = version > 1;
  const locked = item.fork_mode === "locked";
  const forks = item.forks ?? item.downloads;
  const views = item.views ?? 0;
  // Skill listings carry their SKILL.md pack in the published snapshot.
  const hasSkillPack =
    item.kind === "skill" && Boolean((item.snapshot as Record<string, unknown> | undefined)?.skill_md);

  // Optimistic like: reflect the tap instantly, then reconcile when the
  // canonical item refreshes (the mutation invalidates the listing query).
  const [optimistic, setOptimistic] = useState<{ liked: boolean; likes: number } | null>(null);
  const liked = optimistic?.liked ?? item.liked ?? false;
  const likes = optimistic?.likes ?? item.likes ?? 0;
  useEffect(() => {
    setOptimistic(null);
  }, [item.liked, item.likes]);

  const toggleLike = async () => {
    const nextLiked = !liked;
    setOptimistic({ liked: nextLiked, likes: Math.max(0, likes + (nextLiked ? 1 : -1)) });
    try {
      await like.mutateAsync(item.id);
    } catch {
      setOptimistic(null); // revert on failure
    }
  };

  return (
    <motion.div
      layout="position"
      variants={fadeUp}
      exit="hidden"
      transition={spring.soft}
      className="h-full"
    >
      <motion.div
        whileHover={reduce ? undefined : { y: -4 }}
        transition={spring.snappy}
        className="h-full"
      >
        <Card className="group flex h-full flex-col gap-4 p-5 transition-colors hover:border-brand/40">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="truncate text-base font-semibold leading-snug tracking-tight text-ink">
                {item.title}
              </h3>
              <span className="font-mono text-[11px] text-faint">
                {isAgent ? t("card.agentSubtitle") : t("card.skillSubtitle")}
              </span>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <Badge tone={isAgent ? "brand" : "accent"}>{t(`kind.${item.kind}`)}</Badge>
              {showVersion && (
                <Badge tone="neutral" className="font-mono">
                  {t("card.versionBadge", { version })}
                </Badge>
              )}
              {hasSkillPack && <Badge tone="success">{t("card.skillPack")}</Badge>}
            </div>
          </div>

          {/* Description */}
          <p className="flex-1 text-sm leading-relaxed text-muted">
            {item.description ? truncate(item.description, 130) : t("card.noDescription")}
          </p>

          {/* Social + version stats */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-faint">
            <button
              type="button"
              onClick={() => void toggleLike()}
              disabled={like.isPending}
              aria-pressed={liked}
              aria-label={liked ? t("card.unlike") : t("card.like")}
              title={t("card.likesLabel", { value: likes.toLocaleString() })}
              className={cn(
                "-ml-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
                "disabled:cursor-default",
                liked ? "text-brand" : "text-faint hover:text-ink",
              )}
            >
              <motion.span
                key={liked ? "on" : "off"}
                initial={reduce ? false : { scale: 0.6 }}
                animate={{ scale: 1 }}
                transition={spring.bouncy}
                className="inline-flex"
              >
                <HeartIcon filled={liked} />
              </motion.span>
              <span className="font-medium tabular-nums">{likes.toLocaleString()}</span>
            </button>

            <span
              className="inline-flex items-center gap-1"
              title={t("card.forksLabel", { value: forks.toLocaleString() })}
            >
              <ForkIcon />
              <span className="tabular-nums">{forks.toLocaleString()}</span>
            </span>

            <span
              className="inline-flex items-center gap-1"
              title={t("card.viewsLabel", { value: views.toLocaleString() })}
            >
              <EyeIcon />
              <span className="tabular-nums">{views.toLocaleString()}</span>
            </span>

            <span aria-hidden className="text-border">
              ·
            </span>
            <span>{timeAgo(item.updated_at ?? item.created_at)}</span>

            <span
              className="chip ml-auto"
              title={locked ? t("card.lockedHint") : t("card.editableHint")}
            >
              {locked ? <LockIcon /> : <PencilIcon />}
              {locked ? t("forkMode.locked") : t("forkMode.editable")}
            </span>
          </div>

          {/* Price + actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-sm font-semibold",
                free ? "text-accent" : "text-ink",
              )}
            >
              {free ? (
                t("free")
              ) : (
                <>
                  <span aria-hidden className="text-brand">
                    ⟡
                  </span>
                  {t("pts", { value: item.price_points.toLocaleString() })}
                </>
              )}
            </span>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => onViewVersions(item)}>
                {t("card.versions")}
              </Button>
              {isOwner && (
                <Button size="sm" variant="ghost" onClick={() => onPublish(item)}>
                  {t("card.publish")}
                </Button>
              )}
              <Button size="sm" variant="secondary" loading={forking} onClick={() => onFork(item)}>
                {t("card.fork")}
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} aria-hidden>
      <path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ForkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="6" cy="5" r="2.3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="18" cy="5" r="2.3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="19" r="2.3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M6 7.3v1.2c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M12 10.5v6.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10.5V8a4 4 0 1 1 8 0v2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 20h4L18 10l-4-4L4 16v4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m13.5 6.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
