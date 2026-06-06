import { motion } from "motion/react";
import type { MarketplaceItem } from "../../lib/api";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { spring, fadeUp } from "../../lib/anim";
import { timeAgo, truncate } from "../../lib/format";
import { cn } from "../../lib/cn";

export interface MarketplaceCardProps {
  item: MarketplaceItem;
  onFork: (item: MarketplaceItem) => void;
  forking?: boolean;
}

/**
 * A single marketplace listing. Participates in the page's staggered entrance
 * (via the `fadeUp` variant) and `layout` reflow on filter changes, with a
 * compositor-only hover lift on a nested node so the two never fight.
 */
export function MarketplaceCard({ item, onFork, forking = false }: MarketplaceCardProps) {
  const isAgent = item.kind === "agent";
  const free = item.price_points === 0;

  return (
    <motion.div
      layout="position"
      variants={fadeUp}
      exit="hidden"
      transition={spring.soft}
      className="h-full"
    >
      <motion.div whileHover={{ y: -4 }} transition={spring.snappy} className="h-full">
        <Card className="group flex h-full flex-col gap-4 p-5 transition-colors hover:border-brand/40">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="truncate text-base font-semibold leading-snug tracking-tight text-ink">
                {item.title}
              </h3>
              <span className="font-mono text-[11px] text-faint">
                {isAgent ? "Agent twin" : "Skill module"}
              </span>
            </div>
            <Badge tone={isAgent ? "brand" : "accent"} className="shrink-0 capitalize">
              {item.kind}
            </Badge>
          </div>

          <p className="flex-1 text-sm leading-relaxed text-muted">
            {item.description ? truncate(item.description, 130) : "No description provided."}
          </p>

          <div className="flex items-center gap-2.5 text-xs text-faint">
            <span className="inline-flex items-center gap-1">
              <DownloadIcon />
              {item.downloads.toLocaleString()}
            </span>
            <span aria-hidden className="text-border">
              ·
            </span>
            <span>{timeAgo(item.created_at)}</span>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-4">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-sm font-semibold",
                free ? "text-accent" : "text-ink",
              )}
            >
              {free ? (
                "Free"
              ) : (
                <>
                  <span aria-hidden className="text-brand">
                    ⟡
                  </span>
                  {item.price_points.toLocaleString()} pts
                </>
              )}
            </span>
            <Button size="sm" variant="secondary" loading={forking} onClick={() => onFork(item)}>
              Fork
            </Button>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12m0 0 4-4m-4 4-4-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 21h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
