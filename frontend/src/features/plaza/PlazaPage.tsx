/**
 * The plaza (refactor plan §7). Reached by clicking a scenario on the world map
 * (`/plaza/:scenarioId`). It shows the other users' twins (presence-driven) as
 * little characters drifting around an isometric plaza — click one to see who it
 * is, and spectate an encounter that's underway. The caller's own travelling
 * twin is overlaid when its journey has it here.
 *
 * Presence is real-endpoint-first (`GET /api/scenarios/{id}/presence` snapshot +
 * the `/stream` SSE channel) with a typed-mock fallback, so the plaza is alive
 * before the backend lands (a 演示数据 pill lights up when the mock is used).
 */
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import { useDemoMode, useScenario } from "../../lib/queries";
import { isActiveTrip, useActiveTrip } from "../../lib/trips";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { scenarioEmoji } from "../island/iso";
import { ensurePlazaI18n } from "./i18n";
import { PlazaStage } from "./PlazaStage";
import { PlazaPanel } from "./PlazaPanel";
import { TwinFocus } from "./TwinFocus";
import { usePlazaPresence } from "./presence";
import type { PresenceTwin } from "./presence";

export function PlazaPage() {
  ensurePlazaI18n();
  const { scenarioId } = useParams<{ scenarioId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation(["plaza", "island", "common"]);
  const reduce = useReducedMotion() ?? false;
  const demo = useDemoMode();

  const { data: scenario, isLoading } = useScenario(scenarioId);
  const { trip } = useActiveTrip();

  const targetId = scenario?.id ?? scenarioId;

  // Overlay the caller's own travelling twin when its journey has it here.
  const selfTwin = useMemo<PresenceTwin | null>(() => {
    if (!trip?.agent || !isActiveTrip(trip) || !targetId) return null;
    const enc =
      trip.encounters.find((e) => e.status === "running") ??
      trip.encounters.find((e) => e.status === "pending");
    if (!enc || enc.scenario_id !== targetId) return null;
    const status = trip.agent_status;
    if (status !== "meeting" && status !== "talking" && status !== "traveling") return null;
    return {
      agent_id: trip.agent.id,
      agent: trip.agent,
      status,
      trip_id: trip.id,
      encounter_id: enc.id,
      conversation_id: enc.conversation_id,
      is_self: true,
      entered_at: new Date().toISOString(),
    };
  }, [trip, targetId]);

  const { present, encounters, count } = usePlazaPresence(targetId, { selfTwin });

  const [selected, setSelected] = useState<PresenceTwin | null>(null);

  const onSelect = useCallback((twin: PresenceTwin) => setSelected(twin), []);
  const onClose = useCallback(() => setSelected(null), []);
  const onViewAgent = useCallback((agentId: string) => navigate(`/agents/${agentId}`), [navigate]);
  const onSpectate = useCallback((cid: string) => navigate(`/conversations/${cid}`), [navigate]);

  const plazaLabel = scenario ? scenario.name.split("·")[0]?.trim() || scenario.name : t("island:world.plaza");
  const centerEmoji = scenario ? scenarioEmoji(scenario, 0) : undefined;

  if (!scenario && isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow={t("plaza:eyebrow")} title={t("island:world.plaza")} backTo="/" backLabel={t("plaza:back")} />
        <Card className="grid h-[40vh] place-items-center">
          <span className="text-sm text-faint">{t("common:actions.loading")}</span>
        </Card>
      </div>
    );
  }

  if (!scenario) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow={t("plaza:eyebrow")} title={t("island:world.plaza")} backTo="/" backLabel={t("plaza:back")} />
        <EmptyState
          icon={<span>🏛️</span>}
          title={t("plaza:notFound.title")}
          description={t("plaza:notFound.description")}
          action={<Button onClick={() => navigate("/")}>{t("plaza:back")}</Button>}
        />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-6">
      <PageHeader
        eyebrow={t("plaza:eyebrow")}
        title={scenario.name}
        description={t("plaza:subtitle")}
        backTo="/"
        backLabel={t("plaza:back")}
        actions={
          <div className="flex items-center gap-2">
            {demo && (
              <span className="rounded-full bg-surface-2/80 px-2.5 py-1 text-xs text-faint ring-1 ring-border/60">
                {t("common:demo.hint")}
              </span>
            )}
            <Badge tone="brand">{t("plaza:present.count", { count })}</Badge>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* stage */}
        <div className="lg:col-span-2">
          <div className="world-canvas world-vignette relative h-[58vh] min-h-[420px] overflow-hidden rounded-3xl border border-border/60 shadow-float">
            <PlazaStage
              present={present}
              encounters={encounters}
              reduce={reduce}
              onSelect={onSelect}
              centerEmoji={centerEmoji}
              plazaLabel={plazaLabel}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
              <span className="rounded-full bg-surface/80 px-3 py-1 text-xs text-muted ring-1 ring-border/50 backdrop-blur">
                {t("plaza:stageHint")}
              </span>
            </div>
          </div>
        </div>

        {/* read-out */}
        <div className="lg:col-span-1">
          <PlazaPanel present={present} encounters={encounters} onSelect={onSelect} onSpectate={onSpectate} />
        </div>
      </div>

      <AnimatePresence>
        {selected && (
          <TwinFocus
            key={selected.agent_id}
            twin={selected}
            onClose={onClose}
            onViewAgent={onViewAgent}
            onSpectate={onSpectate}
            reduce={reduce}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
