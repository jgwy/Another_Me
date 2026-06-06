/**
 * The autonomous dispatch console (refactor plan §6). The user only picks one of
 * their twins and writes a task — the backend planner decides the scenes and the
 * partners, then fans the dispatch out into a {@link Trip} of 2–4 encounters that
 * runs async. On success we *reveal the plan* (its summary + per-stop reasons /
 * risks) right here, then hand off to the living world, the trip detail, or the
 * inbox where postcards + reports arrive.
 *
 * Embeddable: pass `agentId` to lock the actor and `compact` to render inside a
 * detail rail. `scenarioKey`/`opponentId` are accepted for backward-compat with
 * older deep links (AgentDetailPage etc.) and intentionally ignored.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { TripCreate, TripStop } from "../../lib/trips";
import { useCreateTrip } from "../../lib/trips";
import { useAgent, useAgents } from "../../lib/queries";
import { fadeUp, spring, staggerContainer } from "../../lib/anim";
import { cn } from "../../lib/cn";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Textarea } from "../../components/ui/Textarea";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";

export interface DispatchPanelProps {
  agentId?: string;
  /** Accepted for backward-compat with old deep links; ignored by the autonomous flow. */
  scenarioKey?: string;
  /** Accepted for backward-compat with old deep links; ignored by the autonomous flow. */
  opponentId?: string;
  compact?: boolean;
}

const MAX_HINTS = 5;

/** A compact reasons / risks block reused per planned stop. */
function RationaleList({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: "accent" | "warning";
}) {
  if (items.length === 0) return null;
  const dot = tone === "accent" ? "bg-accent" : "bg-warning";
  const text = tone === "accent" ? "text-accent" : "text-warning";
  return (
    <div className="flex flex-col gap-1">
      <span className={cn("text-[0.7rem] font-medium uppercase tracking-wider", text)}>{label}</span>
      <ul className="flex flex-col gap-1">
        {items.map((item, i) => (
          <li key={`${i}-${item}`} className="flex items-start gap-2 text-sm text-muted">
            <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
            <span className="leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DispatchPanel({ agentId, compact }: DispatchPanelProps) {
  const navigate = useNavigate();
  const { t } = useTranslation(["conversation", "trips"]);
  const reduce = useReducedMotion() ?? false;

  const myAgentsQuery = useAgents({ owner: "me" });
  const lockedAgentQuery = useAgent(agentId);
  const createTrip = useCreateTrip();

  const myAgents = myAgentsQuery.data?.items ?? [];

  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [taskPrompt, setTaskPrompt] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxEncounters, setMaxEncounters] = useState("");
  const [hints, setHints] = useState<string[]>([]);
  const [hintDraft, setHintDraft] = useState("");
  const [errors, setErrors] = useState<{ task?: string; agent?: string }>({});

  // Resolve the active actor: locked `agentId` → explicit pick → first owned twin.
  const activeSelectId = selectedAgentId || myAgents[0]?.id || "";
  const effectiveAgentId = agentId ?? activeSelectId;
  const selectedAgent = agentId
    ? lockedAgentQuery.data
    : myAgents.find((a) => a.id === activeSelectId);

  const createdTrip = createTrip.isSuccess ? createTrip.data : undefined;

  const addHint = () => {
    const value = hintDraft.trim();
    if (!value) return;
    setHints((prev) => (prev.includes(value) || prev.length >= MAX_HINTS ? prev : [...prev, value]));
    setHintDraft("");
  };

  const removeHint = (value: string) => setHints((prev) => prev.filter((h) => h !== value));

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!effectiveAgentId) next.agent = t("dispatch.agentError");
    if (!taskPrompt.trim()) next.task = t("dispatch.taskError");
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    const payload: TripCreate = {
      agent_id: effectiveAgentId,
      task_prompt: taskPrompt.trim(),
    };
    if (maxEncounters) payload.max_encounters = Number(maxEncounters);
    if (hints.length > 0) payload.scenario_hints = hints;
    try {
      await createTrip.mutateAsync(payload);
    } catch {
      /* surfaced via the dispatchError banner */
    }
  };

  const dispatchAnother = () => {
    createTrip.reset();
    setTaskPrompt("");
    setHints([]);
    setHintDraft("");
    setErrors({});
  };

  const dispatchError = createTrip.isError
    ? createTrip.error?.message || t("dispatch.dispatchError")
    : null;

  const maxOptions = [
    { value: "", label: t("dispatch.maxAuto") },
    { value: "2", label: "2" },
    { value: "3", label: "3" },
    { value: "4", label: "4" },
  ];

  const sceneLabel = (key: string | null): string =>
    key ? t(`trips:scenes.${key}`, { defaultValue: key }) : "";

  const gap = compact ? "gap-5" : "gap-6";

  return (
    <Card glass className={cn("flex flex-col p-5 sm:p-6", gap)}>
      <AnimatePresence mode="wait" initial={false}>
        {createdTrip ? (
          /* ---------------------------- Plan reveal ---------------------------- */
          <motion.div
            key="plan"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={spring.soft}
            className={cn("flex flex-col", gap)}
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-base">🗺️</span>
                <h2
                  className={cn(
                    "font-semibold tracking-tight text-ink",
                    compact ? "text-base" : "text-lg",
                  )}
                >
                  {t("dispatch.plan.createdTitle")}
                </h2>
              </div>
              <p className="text-sm text-muted">{t("dispatch.plan.createdSubtitle")}</p>
            </div>

            {/* Actor + task recap */}
            <div className="flex items-center gap-3 rounded-xl bg-surface-2/40 p-3 ring-1 ring-border/40">
              <Avatar
                name={createdTrip.agent?.name ?? selectedAgent?.name ?? "?"}
                avatar={createdTrip.agent?.avatar ?? selectedAgent?.avatar ?? null}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">
                  {createdTrip.agent?.name ?? selectedAgent?.name}
                </div>
                <div className="truncate text-xs text-faint">{createdTrip.task_prompt}</div>
              </div>
            </div>

            {/* Plan summary */}
            {createdTrip.plan?.summary && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium tracking-wide text-muted">
                  {t("dispatch.plan.summary")}
                </span>
                <p className="text-sm leading-relaxed text-ink">{createdTrip.plan.summary}</p>
              </div>
            )}

            {/* Per-stop reasons / risks */}
            <motion.ol
              variants={reduce ? undefined : staggerContainer(0.06)}
              initial={reduce ? undefined : "hidden"}
              animate={reduce ? undefined : "show"}
              className="flex flex-col gap-2.5"
            >
              {(createdTrip.plan?.stops ?? []).map((stop: TripStop, i) => {
                const scene = sceneLabel(stop.scenario_key);
                return (
                  <motion.li
                    key={i}
                    variants={reduce ? undefined : fadeUp}
                    transition={spring.soft}
                    className="flex flex-col gap-2 rounded-xl bg-surface-2/40 p-3.5 ring-1 ring-border/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-ink">
                        {t("dispatch.plan.stop", { index: i + 1 })}
                      </span>
                      {scene && <Badge tone="brand">{scene}</Badge>}
                    </div>
                    <RationaleList
                      label={t("dispatch.plan.reasons")}
                      items={stop.reasons}
                      tone="accent"
                    />
                    <RationaleList
                      label={t("dispatch.plan.risks")}
                      items={stop.risks}
                      tone="warning"
                    />
                  </motion.li>
                );
              })}
            </motion.ol>

            <p className="rounded-xl bg-brand-soft/60 px-3.5 py-2.5 text-xs leading-relaxed text-brand ring-1 ring-brand/20">
              {t("dispatch.asyncNote")}
            </p>

            {/* Handoffs */}
            <div className={cn("grid gap-2.5", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
              <Button
                onClick={() => navigate(`/trips/${createdTrip.id}`)}
                rightIcon={<span aria-hidden>→</span>}
              >
                {t("dispatch.plan.toTrip")}
              </Button>
              <Button variant="secondary" onClick={() => navigate("/")}>
                {t("dispatch.plan.toWorld")}
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigate("/inbox")}>
                {t("dispatch.plan.toInbox")}
              </Button>
              <Button variant="ghost" size="sm" onClick={dispatchAnother}>
                {t("dispatch.plan.again")}
              </Button>
            </div>
          </motion.div>
        ) : (
          /* ------------------------------- Form -------------------------------- */
          <motion.div
            key="form"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={spring.soft}
            className={cn("flex flex-col", gap)}
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-base">🧭</span>
                <h2
                  className={cn(
                    "font-semibold tracking-tight text-ink",
                    compact ? "text-base" : "text-lg",
                  )}
                >
                  {t("dispatch.title")}
                </h2>
              </div>
              <p className="text-sm text-muted">{t("dispatch.subtitle")}</p>
            </div>

            {/* Agent */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium tracking-wide text-muted">
                {t("dispatch.agent")}
              </span>
              {agentId ? (
                lockedAgentQuery.isLoading ? (
                  <div className="flex items-center gap-3 rounded-xl bg-surface-2/40 p-3 ring-1 ring-border/40">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                ) : selectedAgent ? (
                  <div className="flex items-center gap-3 rounded-xl bg-surface-2/40 p-3 ring-1 ring-border/40">
                    <Avatar name={selectedAgent.name} avatar={selectedAgent.avatar} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{selectedAgent.name}</div>
                      <div className="font-mono text-xs text-faint">{selectedAgent.id.slice(0, 8)}</div>
                    </div>
                    <Badge tone="brand">{t("dispatch.lockedIn")}</Badge>
                  </div>
                ) : (
                  <p className="text-sm text-faint">{t("dispatch.agentNotFound")}</p>
                )
              ) : myAgentsQuery.isLoading ? (
                <Skeleton className="h-11 w-full" />
              ) : myAgents.length === 0 ? (
                <EmptyState
                  className="py-8"
                  icon={<span>🫥</span>}
                  title={t("dispatch.emptyTitle")}
                  description={t("dispatch.emptyDescription")}
                  action={<Button onClick={() => navigate("/agents/new")}>{t("dispatch.build")}</Button>}
                />
              ) : (
                <div className="flex items-center gap-3">
                  {selectedAgent && (
                    <Avatar name={selectedAgent.name} avatar={selectedAgent.avatar} size="md" />
                  )}
                  <div className="flex-1">
                    <Select
                      aria-label={t("dispatch.agent")}
                      value={activeSelectId}
                      onChange={(e) => setSelectedAgentId(e.target.value)}
                      options={myAgents.map((a) => ({ value: a.id, label: a.name }))}
                    />
                  </div>
                </div>
              )}
              {errors.agent && <span className="text-xs text-danger">{errors.agent}</span>}
            </div>

            {/* Task */}
            <Textarea
              label={t("dispatch.task")}
              rows={compact ? 3 : 4}
              placeholder={t("dispatch.taskPlaceholder")}
              value={taskPrompt}
              onChange={(e) => setTaskPrompt(e.target.value)}
              error={errors.task}
            />

            {/* Advanced (collapsible) */}
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                aria-expanded={showAdvanced}
                className="flex w-fit items-center gap-1.5 text-xs font-medium tracking-wide text-muted transition-colors hover:text-ink"
              >
                <motion.span
                  aria-hidden
                  animate={reduce ? undefined : { rotate: showAdvanced ? 90 : 0 }}
                  transition={spring.snappy}
                  className="inline-flex"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </motion.span>
                {t("dispatch.advanced")}
              </button>

              <AnimatePresence initial={false}>
                {showAdvanced && (
                  <motion.div
                    initial={reduce ? false : { opacity: 0, height: 0 }}
                    animate={reduce ? undefined : { opacity: 1, height: "auto" }}
                    exit={reduce ? undefined : { opacity: 0, height: 0 }}
                    transition={spring.soft}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-col gap-4 rounded-xl bg-surface-2/30 p-3.5 ring-1 ring-border/40">
                      <Select
                        label={t("dispatch.maxEncounters")}
                        hint={t("dispatch.maxEncountersHint")}
                        value={maxEncounters}
                        onChange={(e) => setMaxEncounters(e.target.value)}
                        options={maxOptions}
                      />

                      <div className="flex flex-col gap-2">
                        <Input
                          label={t("dispatch.hints")}
                          hint={t("dispatch.hintsHint")}
                          placeholder={t("dispatch.hintsPlaceholder")}
                          value={hintDraft}
                          onChange={(e) => setHintDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === ",") {
                              e.preventDefault();
                              addHint();
                            }
                          }}
                          onBlur={addHint}
                        />
                        {hints.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {hints.map((h) => (
                              <span
                                key={h}
                                className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand ring-1 ring-brand/40"
                              >
                                {h}
                                <button
                                  type="button"
                                  onClick={() => removeHint(h)}
                                  aria-label={`${t("dispatch.hintRemove")}: ${h}`}
                                  className="grid h-3.5 w-3.5 place-items-center rounded-full text-brand/70 transition-colors hover:bg-brand/15 hover:text-brand"
                                >
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden>
                                    <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                                  </svg>
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <p className="rounded-xl bg-surface-2/40 px-3.5 py-2.5 text-xs leading-relaxed text-faint ring-1 ring-border/40">
              {t("dispatch.asyncNote")}
            </p>

            {/* Error + submit */}
            <AnimatePresence>
              {dispatchError && (
                <motion.div
                  initial={reduce ? false : { opacity: 0, y: -6 }}
                  animate={reduce ? undefined : { opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, y: -6 }}
                  transition={spring.snappy}
                  className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
                >
                  {dispatchError}
                </motion.div>
              )}
            </AnimatePresence>

            <Button
              size="lg"
              onClick={submit}
              loading={createTrip.isPending}
              disabled={myAgents.length === 0 && !agentId}
              rightIcon={<span aria-hidden>→</span>}
              className="w-full"
            >
              {createTrip.isPending ? t("dispatch.submitting") : t("dispatch.submit")}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
