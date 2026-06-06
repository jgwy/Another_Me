import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

import { useConversations, useScenarios } from "../../lib/queries";
import { fadeUp, spring, staggerContainer } from "../../lib/anim";
import { cn } from "../../lib/cn";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";
import type { BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { PageHeader } from "../../components/layout/PageHeader";
import { timeAgo } from "../../lib/format";

const STATUS_TONE: Record<string, BadgeTone> = {
  running: "success",
  completed: "neutral",
  pending: "warning",
  failed: "danger",
};

export function ConversationsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(["conversation", "common"]);
  const conversationsQuery = useConversations();
  const scenariosQuery = useScenarios();

  const scenarioById = useMemo(() => {
    const m = new Map<string, string>();
    (scenariosQuery.data ?? []).forEach((s) => m.set(s.id, s.name));
    return m;
  }, [scenariosQuery.data]);

  const conversations = conversationsQuery.data?.items ?? [];

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow={t("list.eyebrow")}
        title={t("list.title")}
        description={t("list.description")}
        actions={<Button onClick={() => navigate("/dispatch")}>{t("list.dispatch")}</Button>}
      />

      {conversationsQuery.isLoading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <EmptyState
          icon="🗺️"
          title={t("list.emptyTitle")}
          description={t("list.emptyDescription")}
          action={<Button onClick={() => navigate("/dispatch")}>{t("list.dispatch")}</Button>}
        />
      ) : (
        <motion.ul variants={staggerContainer(0.05)} initial="hidden" animate="show" className="flex flex-col gap-3">
          {conversations.map((c) => (
            <motion.li key={c.id} variants={fadeUp} transition={spring.soft}>
              <Card
                className="flex cursor-pointer items-center gap-4 p-4 transition-colors hover:border-brand/40"
                onClick={() => navigate(`/conversations/${c.id}`)}
              >
                <div className="flex -space-x-2">
                  {c.participants.map((p) => (
                    <Avatar key={p.id} name={p.agent.name} avatar={p.agent.avatar} size="sm" className="ring-2 ring-surface" />
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">
                    {c.title ?? scenarioById.get(c.scenario_id) ?? t("list.fallbackTitle")}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-faint">
                    <span>{scenarioById.get(c.scenario_id)}</span>
                    <span>·</span>
                    <span>{t("list.twins", { count: c.participants.length })}</span>
                    <span>·</span>
                    <span>{timeAgo(c.started_at ?? c.created_at)}</span>
                  </div>
                </div>
                <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>
                  <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", c.status === "running" ? "bg-success" : "bg-faint")} />
                  {t(`common:status.${c.status}`, { defaultValue: c.status })}
                </Badge>
              </Card>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}
