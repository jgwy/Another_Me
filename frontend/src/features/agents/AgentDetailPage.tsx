/**
 * Full agent profile (R1) with an embedded dispatch console (R5/R6) in the right
 * rail and a lightweight evolution teaser. Reads `:id` from the route, falls back
 * to a not-found state, and shows skeletons while loading.
 */
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "motion/react";

import type { Evolution, Skill, SkillSource } from "../../lib/api";
import { useAgent, useEvolutions } from "../../lib/queries";
import { timeAgo } from "../../lib/format";
import { fadeUp, spring, staggerContainer } from "../../lib/anim";
import { PageHeader } from "../../components/layout/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";
import type { BadgeTone } from "../../components/ui/Badge";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { DispatchPanel } from "../dispatch/DispatchPanel";

const SOURCE_TONE: Record<SkillSource, BadgeTone> = {
  questionnaire: "neutral",
  upload: "brand",
  evolved: "accent",
};

const SOURCE_LABEL: Record<SkillSource, string> = {
  questionnaire: "from questionnaire",
  upload: "uploaded",
  evolved: "evolved",
};

function summarizeDiff(diff: Evolution["diff"]): string[] {
  const labels: Record<string, string> = {
    persona: "persona",
    rules: "rules",
    skills_added: "new skills",
    profile_tags: "tags",
    max_rounds: "rounds",
  };
  return Object.keys(diff).map((key) => labels[key] ?? key.replace(/_/g, " "));
}

function DetailSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <Card className="flex flex-col gap-4 p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
          <Skeleton className="h-16 w-full" />
        </Card>
        <Card className="flex flex-col gap-3 p-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-12 w-full" />
        </Card>
      </div>
      <Skeleton className="h-96 w-full rounded-2xl" />
    </div>
  );
}

function RuleList({ items, tone }: { items: string[]; tone: "accent" | "danger" }) {
  if (items.length === 0) return <p className="text-sm text-faint">—</p>;
  const dot = tone === "danger" ? "bg-danger" : "bg-accent";
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li key={`${i}-${item}`} className="flex items-start gap-2.5 text-sm text-ink">
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: agent, isLoading } = useAgent(id);
  const { data: evolutions } = useEvolutions(id);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Agent" backTo="/agents" backLabel="All agents" />
        <DetailSkeleton />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Agent" backTo="/agents" backLabel="All agents" />
        <EmptyState
          icon={<span>🔍</span>}
          title="We couldn't find that twin"
          description="It may have been removed, or the link is off. Head back to the gallery."
          action={<Button onClick={() => navigate("/agents")}>Back to agents</Button>}
        />
      </div>
    );
  }

  const evoCount = evolutions?.length ?? 0;
  const latestEvo = evolutions?.[0];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Agent"
        title={agent.name}
        description={`${agent.id.slice(0, 8)} · ${agent.is_public ? "Public twin" : "Private twin"}`}
        backTo="/agents"
        backLabel="All agents"
        actions={
          <Button
            onClick={() => navigate(`/dispatch?agent=${agent.id}`)}
            rightIcon={<span aria-hidden>→</span>}
          >
            Dispatch to the island
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile */}
        <motion.div
          variants={staggerContainer(0.06)}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-6 lg:col-span-2"
        >
          <motion.div variants={fadeUp} transition={spring.soft}>
            <Card glow className="flex flex-col gap-5 p-6">
              <div className="flex items-start gap-4">
                <Avatar name={agent.name} avatar={agent.avatar} size="xl" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold tracking-tight text-ink">{agent.name}</h2>
                    <Badge tone={agent.is_public ? "accent" : "neutral"}>
                      {agent.is_public ? "Public" : "Private"}
                    </Badge>
                  </div>
                  <span className="font-mono text-xs text-faint">{agent.id.slice(0, 8)}</span>
                  {agent.forked_from && (
                    <Link
                      to={`/agents/${agent.forked_from}`}
                      className="inline-flex w-fit items-center gap-1 text-xs text-brand transition-colors hover:text-brand-strong"
                    >
                      ⑂ Forked from {agent.forked_from.slice(0, 8)}
                    </Link>
                  )}
                </div>
              </div>

              <p className="text-sm leading-relaxed text-muted">{agent.persona}</p>

              {agent.profile_tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {agent.profile_tags.map((tag) => (
                    <Badge key={tag} tone="brand">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 border-t border-border/40 pt-4">
                <div className="flex flex-col">
                  <span className="text-lg font-semibold text-ink">{agent.max_rounds}</span>
                  <span className="text-xs text-faint">max rounds</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-lg font-semibold text-ink">{agent.skills.length}</span>
                  <span className="text-xs text-faint">skills</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-lg font-semibold text-ink">{evoCount}</span>
                  <span className="text-xs text-faint">evolutions</span>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Rules */}
          <motion.div variants={fadeUp} transition={spring.soft}>
            <Card className="flex flex-col gap-5 p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-faint">Voice & rules</h3>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium tracking-wide text-muted">Tone</span>
                <p className="text-sm text-ink">{agent.rules.tone || "—"}</p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium tracking-wide text-accent">Always</span>
                  <RuleList items={agent.rules.dos} tone="accent" />
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium tracking-wide text-danger">Never</span>
                  <RuleList items={agent.rules.donts} tone="danger" />
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Skills */}
          <motion.div variants={fadeUp} transition={spring.soft}>
            <Card className="flex flex-col gap-4 p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-faint">Skills</h3>
              {agent.skills.length === 0 ? (
                <p className="text-sm text-faint">No skills attached yet.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {agent.skills.map((skill: Skill) => (
                    <li
                      key={skill.id}
                      className="flex flex-col gap-1.5 rounded-xl bg-surface-2/40 p-4 ring-1 ring-border/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-ink">{skill.name}</span>
                        <Badge tone={SOURCE_TONE[skill.source]}>{SOURCE_LABEL[skill.source]}</Badge>
                      </div>
                      <p className="text-sm leading-relaxed text-muted">{skill.content}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </motion.div>

          {/* Evolution teaser */}
          <motion.div variants={fadeUp} transition={spring.soft}>
            <Card className="flex flex-col gap-3 p-6">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-faint">Evolution</h3>
                <Badge tone={evoCount > 0 ? "accent" : "neutral"}>
                  {evoCount} {evoCount === 1 ? "proposal" : "proposals"}
                </Badge>
              </div>
              {latestEvo ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-faint">
                    <span>Latest {timeAgo(latestEvo.created_at)}</span>
                    <Badge tone={latestEvo.applied ? "success" : "warning"}>
                      {latestEvo.applied ? "Applied" : "Pending"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {summarizeDiff(latestEvo.diff).map((label) => (
                      <Badge key={label} tone="neutral">
                        {label}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted">
                    Your twin proposes refinements after each scene — review them to keep it growing.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-faint">
                  No evolutions yet. Dispatch your twin and it'll start proposing improvements.
                </p>
              )}
            </Card>
          </motion.div>
        </motion.div>

        {/* Dispatch rail */}
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={spring.soft}
          className="lg:sticky lg:top-6 lg:h-fit"
        >
          <DispatchPanel agentId={agent.id} compact />
        </motion.div>
      </div>
    </div>
  );
}
