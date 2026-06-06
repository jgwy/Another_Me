import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { MarketplaceItem } from "../../lib/api";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Skeleton } from "../../components/ui/Skeleton";
import { useMarketplaceVersions } from "../../lib/queries";
import { fadeUp, spring, staggerContainer } from "../../lib/anim";
import { timeAgo } from "../../lib/format";

export interface VersionsModalProps {
  /** The listing whose published versions to show; `null` keeps the modal closed. */
  item: MarketplaceItem | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Marketplace v2: an immutable version timeline for a listing. Reads
 * {@link useMarketplaceVersions} and renders newest-first, marking the latest
 * published version as current. Legacy listings (no versions) fall back to a
 * graceful empty state.
 */
export function VersionsModal({ item, open, onClose }: VersionsModalProps) {
  const { t } = useTranslation(["marketplace", "common"]);
  const reduce = useReducedMotion() ?? false;

  // Retain the last opened listing so the content doesn't flash empty while the
  // modal animates out (the parent clears `item` the moment it closes).
  const [shown, setShown] = useState<MarketplaceItem | null>(item);
  useEffect(() => {
    if (item) setShown(item);
  }, [item]);

  const { data, isLoading } = useMarketplaceVersions(shown?.id);

  // Defensive newest-first ordering regardless of source order.
  const versions = [...(data ?? [])].sort((a, b) => b.version - a.version);
  const latest = versions[0]?.version ?? shown?.version ?? 1;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={t("versions.title")}
      description={shown ? t("versions.description", { title: shown.title }) : undefined}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t("common:actions.close")}
        </Button>
      }
    >
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-xl border border-border/50 p-3.5">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-3.5 w-16" />
              </div>
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      ) : versions.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{t("versions.empty")}</p>
      ) : (
        <motion.ol
          className="flex max-h-[60vh] flex-col gap-2.5 overflow-y-auto pr-1"
          variants={staggerContainer(0.04)}
          initial={reduce ? false : "hidden"}
          animate="show"
        >
          {versions.map((v) => {
            const isCurrent = v.version === latest;
            return (
              <motion.li
                key={v.id}
                variants={reduce ? undefined : fadeUp}
                transition={spring.soft}
                className="flex flex-col gap-1.5 rounded-xl border border-border/60 bg-surface-2/40 p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={isCurrent ? "brand" : "neutral"} className="font-mono">
                      {t("versions.versionLabel", { version: v.version })}
                    </Badge>
                    {isCurrent && <Badge tone="accent">{t("versions.current")}</Badge>}
                  </div>
                  <span className="shrink-0 text-xs text-faint">{timeAgo(v.created_at)}</span>
                </div>
                <p className="text-sm leading-relaxed text-muted">
                  {v.changelog?.trim() ? v.changelog : t("versions.noChangelog")}
                </p>
              </motion.li>
            );
          })}
        </motion.ol>
      )}
    </Modal>
  );
}
