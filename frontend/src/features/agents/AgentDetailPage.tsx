/**
 * Full agent profile (R1) with an embedded dispatch console (R5/R6) in the right
 * rail and a lightweight evolution teaser. Reads `:id` from the route, falls back
 * to a not-found state, and shows skeletons while loading.
 *
 * Tuning (plan §3, patch half): a "调优" affordance opens the dual-mode
 * {@link PromptConfigEditor} in a modal, seeded from the agent's structured brain;
 * saving patches `prompt_config` via {@link usePatchAgent}. The brain is also
 * surfaced read-only alongside the persona/rules/skills sections.
 */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { PromptConfig, Skill, SkillSource } from "../../lib/api";
import { isEmptyPromptConfig, normalizePromptConfig } from "../../lib/api";
import { useAgent, useEvolutions, usePatchAgent } from "../../lib/queries";
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
import { Modal } from "../../components/ui/Modal";
import { DispatchPanel } from "../dispatch/DispatchPanel";
import { PromptConfigEditor } from "../create-agent/PromptConfigEditor";

const SOURCE_TONE: Record<SkillSource, BadgeTone> = {
  questionnaire: "neutral",
  upload: "brand",
  evolved: "accent",
  generated: "accent",
  selected: "brand",
};

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

function BrainField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium tracking-wide text-muted">{label}</span>
      <p className="text-sm leading-relaxed text-ink">{value}</p>
    </div>
  );
}

function BrainChips({ label, items, tone }: { label: string; items: string[]; tone: BadgeTone }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium tracking-wide text-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Badge key={item} tone={tone}>
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation(["agents", "common"]);
  const { data: agent, isLoading } = useAgent(id);
  const { data: evolutions } = useEvolutions(id);
  const patchAgent = usePatchAgent(id ?? "");

  const [tuneOpen, setTuneOpen] = useState(false);
  const [draftCfg, setDraftCfg] = useState<PromptConfig | null>(null);
  const [tuneKey, setTuneKey] = useState(0);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title={t("detail.title")} backTo="/agents" backLabel={t("detail.backLabel")} />
        <DetailSkeleton />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title={t("detail.title")} backTo="/agents" backLabel={t("detail.backLabel")} />
        <EmptyState
          icon={<span>🔍</span>}
          title={t("detail.notFoundTitle")}
          description={t("detail.notFoundDescription")}
          action={<Button onClick={() => navigate("/agents")}>{t("detail.backToAgents")}</Button>}
        />
      </div>
    );
  }

  const evoCount = evolutions?.length ?? 0;
  const latestEvo = evolutions?.[0];
  const diffLabels = latestEvo
    ? Object.keys(latestEvo.diff).map((key) => {
        const labelKey = `detail.diffLabels.${key}`;
        const translated = t(labelKey);
        return translated === labelKey ? key.replace(/_/g, " ") : translated;
      })
    : [];

  const brain = normalizePromptConfig(agent.prompt_config, agent.name);
  const brainEmpty = isEmptyPromptConfig(brain);
  const tuneError = patchAgent.isError ? patchAgent.error?.message || t("detail.tuneError") : null;

  const openTune = () => {
    setDraftCfg(normalizePromptConfig(agent.prompt_config, agent.name));
    setTuneKey((k) => k + 1);
    setTuneOpen(true);
  };

  const saveTune = async () => {
    if (!draftCfg) return;
    try {
      await patchAgent.mutateAsync({ prompt_config: draftCfg });
      setTuneOpen(false);
    } catch {
      /* surfaced via the tuneError banner inside the modal */
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={t("detail.eyebrow")}
        title={agent.name}
        description={`${agent.id.slice(0, 8)} · ${
          agent.is_public ? t("detail.publicTwin") : t("detail.privateTwin")
        }`}
        backTo="/agents"
        backLabel={t("detail.backLabel")}
        actions={
          <>
            <Button variant="secondary" onClick={openTune}>
              {t("detail.tune")}
            </Button>
            <Button
              onClick={() => navigate(`/dispatch?agent=${agent.id}`)}
              rightIcon={<span aria-hidden>→</span>}
            >
              {t("detail.dispatch")}
            </Button>
          </>
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
                      {agent.is_public ? t("common:visibility.public") : t("common:visibility.private")}
                    </Badge>
                  </div>
                  <span className="font-mono text-xs text-faint">{agent.id.slice(0, 8)}</span>
                  {agent.forked_from && (
                    <Link
                      to={`/agents/${agent.forked_from}`}
                      className="inline-flex w-fit items-center gap-1 text-xs text-brand transition-colors hover:text-brand-strong"
                    >
                      ⑂ {t("detail.forkedFrom", { id: agent.forked_from.slice(0, 8) })}
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
                  <span className="text-xs text-faint">{t("detail.stats.maxRounds")}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-lg font-semibold text-ink">{agent.skills.length}</span>
                  <span className="text-xs text-faint">{t("detail.stats.skills")}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-lg font-semibold text-ink">{evoCount}</span>
                  <span className="text-xs text-faint">{t("detail.stats.evolutions")}</span>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Structured brain (prompt_config) */}
          <motion.div variants={fadeUp} transition={spring.soft}>
            <Card className="flex flex-col gap-5 p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-faint">
                    {t("detail.brain")}
                  </h3>
                  <span className="text-xs text-faint">{t("detail.brainHint")}</span>
                </div>
                <Button size="sm" variant="secondary" onClick={openTune}>
                  {t("detail.tune")}
                </Button>
              </div>
              {brainEmpty ? (
                <p className="text-sm text-faint">{t("detail.brainEmpty")}</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {brain.identity.one_liner && (
                    <BrainField label={t("detail.oneLiner")} value={brain.identity.one_liner} />
                  )}
                  {brain.voice.tone && <BrainField label={t("detail.voiceTone")} value={brain.voice.tone} />}
                  <BrainChips label={t("detail.coreValues")} items={brain.values.core_values} tone="accent" />
                  <BrainChips label={t("detail.passions")} items={brain.interests.passions} tone="brand" />
                </div>
              )}
            </Card>
          </motion.div>

          {/* Rules */}
          <motion.div variants={fadeUp} transition={spring.soft}>
            <Card className="flex flex-col gap-5 p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-faint">{t("detail.voiceRules")}</h3>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium tracking-wide text-muted">{t("detail.tone")}</span>
                <p className="text-sm text-ink">{agent.rules.tone || "—"}</p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium tracking-wide text-accent">{t("detail.always")}</span>
                  <RuleList items={agent.rules.dos} tone="accent" />
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium tracking-wide text-danger">{t("detail.never")}</span>
                  <RuleList items={agent.rules.donts} tone="danger" />
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Skills */}
          <motion.div variants={fadeUp} transition={spring.soft}>
            <Card className="flex flex-col gap-4 p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-faint">{t("detail.skills")}</h3>
              {agent.skills.length === 0 ? (
                <p className="text-sm text-faint">{t("detail.noSkills")}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {agent.skills.map((skill: Skill) => (
                    <li
                      key={skill.id}
                      className="flex flex-col gap-1.5 rounded-xl bg-surface-2/40 p-4 ring-1 ring-border/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-ink">{skill.name}</span>
                        <Badge tone={SOURCE_TONE[skill.source]}>{t(`detail.skillSource.${skill.source}`)}</Badge>
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
                <h3 className="text-sm font-semibold uppercase tracking-wide text-faint">{t("detail.evolution")}</h3>
                <Badge tone={evoCount > 0 ? "accent" : "neutral"}>
                  {t("detail.proposals", { count: evoCount })}
                </Badge>
              </div>
              {latestEvo ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-faint">
                    <span>{t("detail.latest", { time: timeAgo(latestEvo.created_at) })}</span>
                    <Badge tone={latestEvo.applied ? "success" : "warning"}>
                      {latestEvo.applied ? t("common:actions.applied") : t("common:status.pending")}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {diffLabels.map((label) => (
                      <Badge key={label} tone="neutral">
                        {label}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted">{t("detail.evolutionHint")}</p>
                </div>
              ) : (
                <p className="text-sm text-faint">{t("detail.noEvolutions")}</p>
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

      <Modal
        open={tuneOpen}
        onClose={() => setTuneOpen(false)}
        size="lg"
        title={t("detail.tuneTitle")}
        description={t("detail.tuneDescription")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTuneOpen(false)} disabled={patchAgent.isPending}>
              {t("common:actions.cancel")}
            </Button>
            <Button onClick={saveTune} loading={patchAgent.isPending}>
              {t("detail.tuneSave")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {tuneError && (
            <div className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
              {tuneError}
            </div>
          )}
          <div className="max-h-[62vh] overflow-y-auto pr-1">
            {draftCfg && (
              <PromptConfigEditor key={tuneKey} value={draftCfg} onChange={setDraftCfg} name={agent.name} />
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
