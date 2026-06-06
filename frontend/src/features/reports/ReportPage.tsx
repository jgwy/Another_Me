import { Fragment, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "motion/react";
import type { Participant, Report, ScenarioKind } from "../../lib/api";
import type { BadgeTone } from "../../components/ui/Badge";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
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
import { asString, asStringArray } from "./content";
import { BusinessReport } from "./BusinessReport";
import { EmpathyReport } from "./EmpathyReport";
import { TranscriptReplay } from "./TranscriptReplay";
import { EvolutionDiff } from "./EvolutionDiff";

type TabId = "report" | "transcript" | "evolution";

const TABS = [
  { id: "report", label: "Report" },
  { id: "transcript", label: "Transcript" },
  { id: "evolution", label: "Evolution" },
];

const KIND_TONE: Record<ScenarioKind, BadgeTone> = {
  business: "brand",
  empathy: "accent",
  generic: "neutral",
};

const KIND_LABEL: Record<ScenarioKind, string> = {
  business: "商业评估 · Business",
  empathy: "见闻共情 · Empathy",
  generic: "复盘 · Report",
};

function humanize(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Participants({ participants }: { participants: Participant[] }) {
  if (participants.length === 0) return null;
  const ordered = [...participants].sort((a, b) => a.seat - b.seat);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ordered.map((p, i) => (
        <Fragment key={p.id}>
          {i > 0 && <span className="text-xs text-faint">vs</span>}
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

/** Fallback for `generic` reports: render whatever the content map holds. */
function GenericReport({ report }: { report: Report }) {
  const entries = Object.entries(report.content);
  const rendered = entries.filter(([, value]) => asStringArray(value).length > 0 || asString(value) !== "");

  if (rendered.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted">
        This report has no structured breakdown beyond the summary above.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {rendered.map(([key, value]) => {
        const list = asStringArray(value);
        const text = asString(value);
        return (
          <Card key={key} className="p-5 sm:p-6">
            <span className="text-xs font-medium uppercase tracking-wider text-faint">{humanize(key)}</span>
            {list.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2">
                {list.map((item, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function ReportTab({ report, loading }: { report: Report | undefined; loading: boolean }) {
  if (loading) return <ReportSkeleton />;
  if (!report) {
    return (
      <EmptyState
        icon="📝"
        title="Report still generating"
        description="The scenario has not produced a report yet. Check back once the conversation has wrapped up."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card glow className="p-5 sm:p-6">
        <Badge tone={KIND_TONE[report.kind]}>{KIND_LABEL[report.kind]}</Badge>
        <p className="mt-3 text-base leading-relaxed text-ink sm:text-lg">{report.summary}</p>
      </Card>

      {report.kind === "business" ? (
        <BusinessReport report={report} />
      ) : report.kind === "empathy" ? (
        <EmpathyReport report={report} />
      ) : (
        <GenericReport report={report} />
      )}
    </div>
  );
}

function EvolutionTab({ loading, participants }: { loading: boolean; participants: Participant[] }) {
  if (loading) return <ReportSkeleton />;
  if (participants.length === 0) {
    return (
      <EmptyState
        icon="🧬"
        title="No agents to evolve"
        description="This conversation has no participants to review yet."
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
  const conversationId = id;

  const { data: conversation, isLoading: convLoading } = useConversation(conversationId);
  const { data: scenario } = useScenario(conversation?.scenario_id);
  const { data: report, isLoading: reportLoading } = useReportByConversation(conversationId);
  const { data: messages = [], isLoading: messagesLoading } = useMessages(conversationId);

  const [tab, setTab] = useState<TabId>("report");

  const participants = conversation?.participants ?? [];
  const title = scenario?.name ?? conversation?.title ?? "复盘报告 · Report";
  const description =
    conversation?.title && conversation.title !== title ? conversation.title : scenario?.description;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="复盘报告 · Report"
        title={title}
        description={description ?? undefined}
        backTo={conversationId ? `/conversations/${conversationId}` : "/"}
        backLabel="Back to conversation"
        actions={<Participants participants={participants} />}
      />

      <div className="flex flex-col gap-6">
        <Tabs tabs={TABS} value={tab} onChange={(v) => setTab(v as TabId)} layoutId="report-tabs" />

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
