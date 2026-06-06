import { Fragment, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { Participant, Report } from "../../lib/api";
import { Avatar } from "../../components/ui/Avatar";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { Tabs } from "../../components/ui/Tabs";
import { PageHeader } from "../../components/layout/PageHeader";
import { cn } from "../../lib/cn";
import { fadeUp, spring } from "../../lib/anim";
import {
  useConversation,
  useMessages,
  useReportByConversation,
  useScenario,
} from "../../lib/queries";
import { ReportBody } from "./ReportBody";
import { TranscriptReplay } from "./TranscriptReplay";
import { EvolutionDiff } from "./EvolutionDiff";

type TabId = "report" | "transcript" | "evolution";

const TAB_IDS: TabId[] = ["report", "transcript", "evolution"];

function Participants({ participants }: { participants: Participant[] }) {
  const { t } = useTranslation("common");
  if (participants.length === 0) return null;
  const ordered = [...participants].sort((a, b) => a.seat - b.seat);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ordered.map((p, i) => (
        <Fragment key={p.id}>
          {i > 0 && <span className="text-xs text-faint">{t("vs")}</span>}
          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-surface-2/60 py-1 pl-1 pr-3">
            <Avatar name={p.agent.name} avatar={p.agent.avatar} size="xs" />
            <span className="text-xs font-medium text-ink">{p.agent.name}</span>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-32 w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}

function TranscriptSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={cn("flex", i % 2 === 1 ? "justify-end" : "justify-start")}>
          <Skeleton className="h-20 w-2/3" />
        </div>
      ))}
    </div>
  );
}

function ReportTab({ report, loading }: { report: Report | undefined; loading: boolean }) {
  const { t } = useTranslation("reports");
  if (loading) return <ReportSkeleton />;
  if (!report) {
    return (
      <EmptyState
        icon="📝"
        title={t("report.generatingTitle")}
        description={t("report.generatingDescription")}
      />
    );
  }

  return <ReportBody report={report} />;
}

function EvolutionTab({ loading, participants }: { loading: boolean; participants: Participant[] }) {
  const { t } = useTranslation("reports");
  if (loading) return <ReportSkeleton />;
  if (participants.length === 0) {
    return (
      <EmptyState
        icon="🧬"
        title={t("evolution.tabEmptyTitle")}
        description={t("evolution.tabEmptyDescription")}
      />
    );
  }
  const ordered = [...participants].sort((a, b) => a.seat - b.seat);
  return (
    <div className="flex flex-col gap-8">
      {ordered.map((p) => (
        <section key={p.id} className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Avatar name={p.agent.name} avatar={p.agent.avatar} size="sm" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-ink">{p.agent.name}</span>
              {p.role && <span className="text-xs capitalize text-faint">{p.role}</span>}
            </div>
          </div>
          <EvolutionDiff agentId={p.agent_id} agentName={p.agent.name} />
        </section>
      ))}
    </div>
  );
}

export function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation("reports");
  const conversationId = id;

  const { data: conversation, isLoading: convLoading } = useConversation(conversationId);
  const { data: scenario } = useScenario(conversation?.scenario_id);
  const { data: report, isLoading: reportLoading } = useReportByConversation(conversationId);
  const { data: messages = [], isLoading: messagesLoading } = useMessages(conversationId);

  const [tab, setTab] = useState<TabId>("report");

  const participants = conversation?.participants ?? [];
  const title = scenario?.name ?? conversation?.title ?? t("page.fallbackTitle");
  const description =
    conversation?.title && conversation.title !== title ? conversation.title : scenario?.description;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={t("page.eyebrow")}
        title={title}
        description={description ?? undefined}
        backTo={conversationId ? `/conversations/${conversationId}` : "/"}
        backLabel={t("page.backLabel")}
        actions={<Participants participants={participants} />}
      />

      <div className="flex flex-col gap-6">
        <Tabs
          tabs={TAB_IDS.map((tabId) => ({ id: tabId, label: t(`tabs.${tabId}`) }))}
          value={tab}
          onChange={(v) => setTab(v as TabId)}
          layoutId="report-tabs"
        />

        <motion.div key={tab} variants={fadeUp} initial="hidden" animate="show" transition={spring.soft}>
          {tab === "report" && <ReportTab report={report} loading={convLoading || reportLoading} />}
          {tab === "transcript" &&
            (messagesLoading ? (
              <TranscriptSkeleton />
            ) : (
              <TranscriptReplay messages={messages} participants={participants} />
            ))}
          {tab === "evolution" && <EvolutionTab loading={convLoading} participants={participants} />}
        </motion.div>
      </div>
    </div>
  );
}
