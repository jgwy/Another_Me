/**
 * The reusable dispatch console (R5, R6). Pick an agent, write a task, choose a
 * scenario building, and decide who it faces — profile-matched, a specific agent
 * by id, or a random open seat. On success we jump straight to the spectate view.
 *
 * Embeddable: pass `agentId` to lock the actor, `scenarioKey`/`opponentId` to
 * prefill, and `compact` to render inside a detail rail.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";

import type { DispatchCreate, ScenarioKind } from "../../lib/api";
import { useAgent, useAgents, useCreateDispatch, useScenarios } from "../../lib/queries";
import { spring } from "../../lib/anim";
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

type OpponentMode = "profile" | "byId" | "open";

const KIND_TONE: Record<ScenarioKind, "brand" | "accent" | "neutral"> = {
  business: "brand",
  empathy: "accent",
  generic: "neutral",
};

const OPPONENT_MODES: { id: OpponentMode; label: string; blurb: string }[] = [
  { id: "profile", label: "Profile match", blurb: "We pair the best-fit twin by profile tags." },
  { id: "byId", label: "By agent ID", blurb: "Face a specific twin you know the id of." },
  { id: "open", label: "Open seat", blurb: "Take a random challenger from the island." },
];

export interface DispatchPanelProps {
  agentId?: string;
  scenarioKey?: string;
  opponentId?: string;
  compact?: boolean;
}

export function DispatchPanel({ agentId, scenarioKey, opponentId, compact }: DispatchPanelProps) {
  const navigate = useNavigate();

  const scenariosQuery = useScenarios();
  const myAgentsQuery = useAgents({ owner: "me" });
  const lockedAgentQuery = useAgent(agentId);
  const createDispatch = useCreateDispatch();

  const scenarios = scenariosQuery.data ?? [];
  const myAgents = myAgentsQuery.data?.items ?? [];

  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [taskPrompt, setTaskPrompt] = useState("");
  const [scenarioId, setScenarioId] = useState("");
  const [mode, setMode] = useState<OpponentMode>(opponentId ? "byId" : "profile");
  const [opponentInput, setOpponentInput] = useState(opponentId ?? "");
  const [errors, setErrors] = useState<{ task?: string; agent?: string; opponent?: string }>({});

  // Resolve the active scenario: explicit selection → `scenarioKey` prefill →
  // first open building. Computed (not stateful) so it stays correct as the
  // scenarios list streams in, with no effects or controlled-input flicker.
  const prefillScenario = scenarioKey
    ? scenarios.find((s) => s.key === scenarioKey || s.id === scenarioKey)
    : undefined;
  const defaultScenarioId =
    (prefillScenario ?? scenarios.find((s) => s.is_full) ?? scenarios[0])?.id ?? "";
  const activeScenarioId = scenarioId || defaultScenarioId;
  const selectedScenario = scenarios.find((s) => s.id === activeScenarioId);

  // Resolve the active actor: locked `agentId` → explicit pick → first owned twin.
  const activeSelectId = selectedAgentId || myAgents[0]?.id || "";
  const effectiveAgentId = agentId ?? activeSelectId;
  const selectedAgent = agentId
    ? lockedAgentQuery.data
    : myAgents.find((a) => a.id === activeSelectId);

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!effectiveAgentId) next.agent = "Pick an agent to dispatch.";
    if (!taskPrompt.trim()) next.task = "Describe the task for your twin.";
    if (mode === "byId" && !opponentInput.trim()) next.opponent = "Enter an opponent agent id.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    const payload: DispatchCreate = {
      agent_id: effectiveAgentId,
      scenario_id: activeScenarioId,
      task_prompt: taskPrompt.trim(),
    };
    if (mode === "profile") payload.match_by_profile = true;
    if (mode === "byId") payload.opponent_agent_id = opponentInput.trim();
    // "open" leaves both unset → backend/mock assigns a random challenger.

    try {
      const dispatch = await createDispatch.mutateAsync(payload);
      if (dispatch.conversation_id) {
        navigate(`/conversations/${dispatch.conversation_id}`);
      } else {
        navigate("/");
      }
    } catch {
      /* surfaced via createDispatch.isError banner */
    }
  };

  const dispatchError = createDispatch.isError
    ? createDispatch.error?.message || "Dispatch failed. Please try again."
    : null;

  const gap = compact ? "gap-5" : "gap-6";

  return (
    <Card glass className={cn("flex flex-col p-5 sm:p-6", gap)}>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-base">🛰️</span>
          <h2
            className={cn(
              "font-semibold tracking-tight text-ink",
              compact ? "text-base" : "text-lg",
            )}
          >
            Dispatch to the island
          </h2>
        </div>
        <p className="text-sm text-muted">Send your twin into a live scenario and watch it play out.</p>
      </div>

      {/* Agent */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium tracking-wide text-muted">Agent</span>
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
              <Badge tone="brand">Locked in</Badge>
            </div>
          ) : (
            <p className="text-sm text-faint">Agent not found.</p>
          )
        ) : myAgentsQuery.isLoading ? (
          <Skeleton className="h-11 w-full" />
        ) : myAgents.length === 0 ? (
          <EmptyState
            className="py-8"
            icon={<span>🫥</span>}
            title="No twins to dispatch"
            description="Build a twin first, then send it out."
            action={<Button onClick={() => navigate("/agents/new")}>Build a twin</Button>}
          />
        ) : (
          <div className="flex items-center gap-3">
            {selectedAgent && (
              <Avatar name={selectedAgent.name} avatar={selectedAgent.avatar} size="md" />
            )}
            <div className="flex-1">
              <Select
                aria-label="Agent"
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
        label="Task"
        rows={compact ? 3 : 4}
        placeholder="What should your twin try to accomplish in this scene?"
        value={taskPrompt}
        onChange={(e) => setTaskPrompt(e.target.value)}
        error={errors.task}
      />

      {/* Scenario */}
      <div className="flex flex-col gap-2.5">
        <span className="text-xs font-medium tracking-wide text-muted">Scenario</span>
        {scenariosQuery.isLoading ? (
          <div className={cn("grid gap-3", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ) : (
          <div className={cn("grid gap-3", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
            {scenarios.map((scenario) => {
              const active = scenario.id === activeScenarioId;
              return (
                <motion.button
                  key={scenario.id}
                  type="button"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  transition={spring.snappy}
                  onClick={() => setScenarioId(scenario.id)}
                  className={cn(
                    "flex flex-col gap-1.5 rounded-xl p-3.5 text-left ring-1 transition-colors",
                    active
                      ? "bg-brand-soft ring-brand/50"
                      : "bg-surface-2/40 ring-border/40 hover:ring-border",
                  )}
                  aria-pressed={active}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-ink">{scenario.name}</span>
                    <Badge tone={KIND_TONE[scenario.kind]}>{scenario.kind}</Badge>
                  </div>
                  <span className="font-mono text-xs text-faint">{scenario.meta.building}</span>
                  <div className="mt-0.5">
                    {scenario.is_full ? (
                      <span className="inline-flex items-center gap-1 text-xs text-accent">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                        Open for dispatch
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-warning">
                        <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                        Placeholder scene
                      </span>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
        {selectedScenario && !selectedScenario.is_full && (
          <p className="text-xs text-faint">
            This building is a placeholder — your twin can still run here while the scene is finalized.
          </p>
        )}
      </div>

      {/* Opponent */}
      <div className="flex flex-col gap-2.5">
        <span className="text-xs font-medium tracking-wide text-muted">Opponent</span>
        <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-surface-2/50 p-1 ring-1 ring-border/40">
          {OPPONENT_MODES.map((m) => {
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={cn(
                  "relative rounded-lg px-2 py-2 text-xs font-medium transition-colors",
                  active ? "text-white" : "text-muted hover:text-ink",
                )}
                aria-pressed={active}
              >
                {active && (
                  <motion.span
                    layoutId={`opp-${compact ? "compact" : "full"}`}
                    className="absolute inset-0 rounded-lg bg-brand"
                    transition={spring.snappy}
                  />
                )}
                <span className="relative">{m.label}</span>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-faint">{OPPONENT_MODES.find((m) => m.id === mode)!.blurb}</p>

        <AnimatePresence initial={false}>
          {mode === "byId" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={spring.soft}
              className="overflow-hidden"
            >
              <Input
                placeholder="Opponent agent id (UUID)"
                value={opponentInput}
                onChange={(e) => setOpponentInput(e.target.value)}
                error={errors.opponent}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error + submit */}
      <AnimatePresence>
        {dispatchError && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
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
        loading={createDispatch.isPending}
        disabled={myAgents.length === 0 && !agentId}
        rightIcon={<span aria-hidden>→</span>}
        className="w-full"
      >
        Dispatch
      </Button>
    </Card>
  );
}
