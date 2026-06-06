import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { Notification } from "../../lib/api";
import {
  useInbox,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useUnreadCount,
} from "../../lib/queries";
import { cn } from "../../lib/cn";
import { timeAgo } from "../../lib/format";
import { fadeUp, spring, staggerContainer } from "../../lib/anim";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { KIND_META, resolveOpenTarget } from "./notificationMeta";

type Filter = "all" | "unread";

const PAGE_SIZE = 20;

/** A rounded pill toggle for 全部 / 未读. No animation — a plain background swap. */
function Segmented({
  value,
  onChange,
  options,
}: {
  value: Filter;
  onChange: (v: Filter) => void;
  options: { id: Filter; label: string }[];
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface-2/60 p-1">
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            aria-pressed={active}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-surface text-ink shadow-soft" : "text-muted hover:text-ink",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-start gap-4 px-5 py-4">
      <Skeleton className="h-9 w-9 rounded-xl" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
      <Skeleton className="h-3 w-12" />
    </div>
  );
}

function NotificationRow({ notification }: { notification: Notification }) {
  const { t } = useTranslation(["inbox", "common"]);
  const navigate = useNavigate();
  const markRead = useMarkNotificationRead();

  const meta = KIND_META[notification.kind];
  const target = resolveOpenTarget(notification);
  const unread = !notification.read;
  const marking = markRead.isPending && markRead.variables === notification.id;

  const handleMarkRead = () => {
    if (!unread) return;
    void markRead.mutateAsync(notification.id);
  };

  const handleOpen = () => {
    if (!target) return;
    handleMarkRead();
    navigate(target.to);
  };

  const interactive = !!target;

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? handleOpen : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleOpen();
              }
            }
          : undefined
      }
      className={cn(
        "flex items-start gap-4 px-5 py-4 transition-colors",
        interactive && "cursor-pointer hover:bg-surface-2/50",
        unread && "bg-brand-soft/40",
      )}
    >
      <span
        className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2/80 text-lg ring-1 ring-border/50"
        aria-hidden
      >
        {meta.icon}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={meta.tone}>{t(`inbox:kind.${notification.kind}`)}</Badge>
          {unread && (
            <span className="text-accent" aria-label={t("inbox:filters.unread")}>
              <span className="status-dot" />
            </span>
          )}
        </div>
        <p className={cn("truncate text-sm", unread ? "font-semibold text-ink" : "font-medium text-ink/90")}>
          {notification.title}
        </p>
        {notification.body && (
          <p className="line-clamp-2 text-sm leading-relaxed text-muted">{notification.body}</p>
        )}
        {target && (
          <span className="mt-0.5 inline-flex w-fit items-center gap-1 text-xs font-medium text-accent">
            {t(target.labelKey)}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="m9 6 6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <time className="text-xs text-faint" dateTime={notification.created_at}>
          {timeAgo(notification.created_at)}
        </time>
        {unread && (
          <Button
            variant="ghost"
            size="sm"
            loading={marking}
            onClick={(e) => {
              e.stopPropagation();
              handleMarkRead();
            }}
            className="-mr-2 h-7 px-2 text-xs"
          >
            {t("inbox:actions.markRead")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function InboxPage() {
  const { t } = useTranslation(["inbox", "common"]);
  const reduce = useReducedMotion() ?? false;

  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const unreadOnly = filter === "unread";
  const { data, isLoading } = useInbox({ unread: unreadOnly || undefined, limit });
  const { data: unreadData } = useUnreadCount();
  const markAll = useMarkAllNotificationsRead();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const unreadCount = unreadData?.count ?? 0;
  const hasMore = items.length < total;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={t("inbox:page.eyebrow")}
        title={t("inbox:page.title")}
        description={t("inbox:page.description")}
        actions={
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <span className="hidden text-sm text-muted sm:inline">
                {t("inbox:unreadLine", { count: unreadCount })}
              </span>
            )}
            <Button
              variant="secondary"
              size="sm"
              loading={markAll.isPending}
              disabled={unreadCount === 0}
              onClick={() => void markAll.mutateAsync()}
            >
              {t("inbox:actions.markAllRead")}
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-5">
        <Segmented
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setLimit(PAGE_SIZE);
          }}
          options={[
            { id: "all", label: t("inbox:filters.all") },
            { id: "unread", label: t("inbox:filters.unread") },
          ]}
        />

        {isLoading ? (
          <Card className="divide-y divide-border/50 overflow-hidden p-0">
            {[0, 1, 2, 3].map((i) => (
              <RowSkeleton key={i} />
            ))}
          </Card>
        ) : items.length === 0 ? (
          <EmptyState
            icon="📬"
            title={unreadOnly ? t("inbox:empty.unreadTitle") : t("inbox:empty.title")}
            description={
              unreadOnly ? t("inbox:empty.unreadDescription") : t("inbox:empty.description")
            }
          />
        ) : (
          <>
            <Card className="overflow-hidden p-0">
              <motion.ul
                variants={reduce ? undefined : staggerContainer(0.05)}
                initial={reduce ? undefined : "hidden"}
                animate={reduce ? undefined : "show"}
                className="divide-y divide-border/50"
              >
                {items.map((n) => (
                  <motion.li key={n.id} variants={reduce ? undefined : fadeUp} transition={spring.soft}>
                    <NotificationRow notification={n} />
                  </motion.li>
                ))}
              </motion.ul>
            </Card>

            {hasMore && (
              <div className="flex justify-center">
                <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                  {t("inbox:loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
