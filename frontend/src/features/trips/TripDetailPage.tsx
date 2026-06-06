/**
 * Trip detail (refactor plan §6). One dispatch becomes one travelling twin that
 * the autonomous planner fans out into 2–4 encounters. This page reads `:id` and
 * tells the whole story: the twin + its task + live phase, the explainable plan
 * (summary + per-stop reasons / risks), each encounter (partner, scene, status,
 * postcard, links to spectate / read the report), and the trip-level summary.
 *
 * The journey runs async — `useTripJourney` surfaces the twin's *live* phase so
 * the header label tracks the world-map frog (frozen under reduced motion).
 */
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { Trip, TripEncounter, TripEncounterStatus, TripStatus, TripStop } from "../../lib/trips";
import { isActiveTrip, postcardText, useCancelTrip, useTrip, useTripJourney } from "../../lib/trips";
import { timeAgo } from "../../lib/format";
import { fadeUp, spring, staggerContainer } from "../../lib/anim";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/layout/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";
import type { BadgeTone } from "../../components/ui/Badge";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";

const STATUS_TONE: Record<TripStatus, BadgeTone> = {
  planning: "warning",
  traveling: "brand",
  in_encounter: "brand",
  returning: "accent",
  completed: "success",
  failed: "danger",
  cancelled: "neutral",
};

const ENCOUNTER_TONE: Record<TripEncounterStatus, BadgeTone> = {
  pending: "neutral",
  running: "brand",
  completed: "success",
  failed: "danger",
  skipped: "neutral",
};

/** A compact reasons / risks block reused per stop + per encounter. */
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

function TripSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Card glow className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
        <Skeleton className="h-12 w-full" />
      </Card>
      <Card className="flex flex-col gap-3 p-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-20 w-full" />
      </Card>
      <Card className="flex flex-col gap-3 p-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-24 w-full" />
      </Card>
    </div>
  );
}

/**
 * The twin's *live* phase label. Isolated into its own component because
 * `useTripJourney` ticks `progress` at ~60fps for an active trip — keeping it
 * here means only this small badge re-renders, never the heavy detail tree.
 */
function LivePhase({ trip, reduce }: { trip: Trip; reduce: boolean }) {
  const { t } = useTranslation(["trips", "common"]);
  const journey = useTripJourney(trip, { enabled: !reduce });
  const active = isActiveTrip(trip);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        active ? "text-brand" : "text-faint",
      )}
    >
      <span className="status-dot" />
      {t(`agentStatus.${journey.agentStatus}`)}
    </span>
  );
}

export function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation(["trips", "common"]);
  const reduce = useReducedMotion() ?? false;

  const { data: trip, isLoading } = useTrip(id);
  const cancelTrip = useCancelTrip();

  const encounters = useMemo(
    () => (trip ? [...trip.encounters].sort((a, b) => a.seq - b.seq) : []),
    [trip],
  );

  const sceneLabel = (key: string | null): string =>
    key ? t(`scenes.${key}`, { defaultValue: key }) : "";

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader eyebrow={t("page.eyebrow")} title={t("page.title")} backTo="/" backLabel={t("page.backLabel")} />
        <TripSkeleton />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader eyebrow={t("page.eyebrow")} title={t("page.title")} backTo="/" backLabel={t("page.backLabel")} />
        <EmptyState
          icon={<span>🧭</span>}
          title={t("empty.title")}
          description={t("empty.description")}
          action={<Button onClick={() => navigate("/")}>{t("actions.toWorld")}</Button>}
        />
      </div>
    );
  }

  const active = isActiveTrip(trip);
  const agentName = trip.agent?.name ?? "?";
  const stops = trip.plan?.stops ?? [];
  const started = timeAgo(trip.started_at ?? trip.created_at);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={t("page.eyebrow")}
        title={agentName}
        backTo="/"
        backLabel={t("page.backLabel")}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[trip.status]}>{t(`status.${trip.status}`)}</Badge>
            <LivePhase trip={trip} reduce={reduce} />
          </div>
        }
      />

      <motion.div
        variants={reduce ? undefined : staggerContainer(0.07)}
        initial={reduce ? undefined : "hidden"}
        animate={reduce ? undefined : "show"}
        className="flex flex-col gap-6"
      >
        {/* Hero — twin + task */}
        <motion.div variants={reduce ? undefined : fadeUp} transition={spring.soft}>
          <Card glow className="flex flex-col gap-5 p-6">
            <div className="flex items-start gap-4">
              <Avatar name={agentName} avatar={trip.agent?.avatar} size="lg" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <h2 className="text-xl font-semibold tracking-tight text-ink">{agentName}</h2>
                {started && <span className="text-xs text-faint">{started}</span>}
              </div>
            </div>
            <div className="flex flex-col gap-1.5 border-t border-border/40 pt-4">
              <span className="text-[0.7rem] font-medium uppercase tracking-wider text-faint">{t("task")}</span>
              <p className="text-sm leading-relaxed text-ink">{trip.task_prompt}</p>
            </div>
          </Card>
        </motion.div>

        {/* Plan */}
        <motion.div variants={reduce ? undefined : fadeUp} transition={spring.soft}>
          <Card className="flex flex-col gap-4 p-6">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-faint">{t("plan.title")}</h3>
              <Badge tone="brand">{t("encounters.count", { count: stops.length })}</Badge>
            </div>

            {trip.plan?.summary && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium tracking-wide text-muted">{t("plan.summary")}</span>
                <p className="text-sm leading-relaxed text-ink">{trip.plan.summary}</p>
              </div>
            )}

            {trip.status === "planning" && (
              <p className="rounded-xl bg-warning/10 px-3.5 py-2.5 text-sm leading-relaxed text-warning ring-1 ring-warning/20">
                {t("plan.planning")}
              </p>
            )}

            {stops.length > 0 && (
              <ol className="flex flex-col gap-2.5">
                {stops.map((stop: TripStop, i) => {
                  const scene = sceneLabel(stop.scenario_key);
                  return (
                    <li
                      key={i}
                      className="flex flex-col gap-2 rounded-xl bg-surface-2/40 p-3.5 ring-1 ring-border/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-ink">{t("plan.stop", { index: i + 1 })}</span>
                        {scene && <Badge tone="brand">{scene}</Badge>}
                      </div>
                      <RationaleList label={t("plan.reasons")} items={stop.reasons} tone="accent" />
                      <RationaleList label={t("plan.risks")} items={stop.risks} tone="warning" />
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </motion.div>

        {/* Encounters */}
        <motion.div variants={reduce ? undefined : fadeUp} transition={spring.soft}>
          <Card className="flex flex-col gap-4 p-6">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-faint">{t("encounters.title")}</h3>
              <span className="text-xs text-faint">{t("encounters.count", { count: encounters.length })}</span>
            </div>

            {encounters.length === 0 ? (
              <p className="text-sm text-faint">{t("encounters.empty")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {encounters.map((enc) => (
                  <EncounterRow key={enc.id} enc={enc} />
                ))}
              </ul>
            )}
          </Card>
        </motion.div>

        {/* Trip summary report */}
        <motion.div variants={reduce ? undefined : fadeUp} transition={spring.soft}>
          <Card className="flex flex-col gap-3 p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-faint">{t("summary.title")}</h3>
            {trip.summary_report_id ? (
              <Button
                variant="secondary"
                className="w-fit"
                onClick={() => navigate(`/reports/${trip.summary_report_id}`)}
                rightIcon={<span aria-hidden>→</span>}
              >
                {t("summary.view")}
              </Button>
            ) : (
              <p className="text-sm text-faint">{t("summary.pending")}</p>
            )}
          </Card>
        </motion.div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center gap-3">
          {active && (
            <Button
              variant="danger"
              loading={cancelTrip.isPending}
              onClick={() => cancelTrip.mutate(trip.id)}
            >
              {cancelTrip.isPending ? t("actions.cancelling") : t("actions.cancel")}
            </Button>
          )}
          <Button variant="secondary" onClick={() => navigate("/")}>
            {t("actions.toWorld")}
          </Button>
          <Button variant="ghost" onClick={() => navigate("/inbox")}>
            {t("actions.toInbox")}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function EncounterRow({ enc }: { enc: TripEncounter }) {
  const navigate = useNavigate();
  const { t } = useTranslation(["trips", "common"]);
  const partnerName = enc.opponent?.name ?? "?";
  const scene = enc.scenario_key ? t(`scenes.${enc.scenario_key}`, { defaultValue: enc.scenario_key }) : "";
  const postcard = postcardText(enc.postcard);

  return (
    <li className="flex flex-col gap-3 rounded-xl bg-surface-2/40 p-4 ring-1 ring-border/40">
      <div className="flex items-start gap-3">
        <Avatar name={partnerName} avatar={enc.opponent?.avatar ?? null} size="sm" className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-ink">{partnerName}</span>
            {scene && <Badge tone="neutral">{scene}</Badge>}
          </div>
          <span className="text-xs text-faint">{t("encounters.withPartner")}</span>
        </div>
        <Badge tone={ENCOUNTER_TONE[enc.status]}>{t(`encounterStatus.${enc.status}`)}</Badge>
      </div>

      <RationaleList label={t("plan.reasons")} items={enc.match_reasons} tone="accent" />
      <RationaleList label={t("plan.risks")} items={enc.match_risks} tone="warning" />

      {postcard && (
        <div className="flex flex-col gap-1 rounded-lg bg-brand-soft/50 px-3 py-2 ring-1 ring-brand/15">
          <span className="text-[0.7rem] font-medium uppercase tracking-wider text-brand/80">
            {t("encounters.postcard")}
          </span>
          <p className="text-sm italic leading-relaxed text-ink">“{postcard}”</p>
        </div>
      )}

      {(enc.conversation_id || enc.report_id) && (
        <div className="flex flex-wrap items-center gap-2">
          {enc.conversation_id && (
            <Button size="sm" variant="secondary" onClick={() => navigate(`/conversations/${enc.conversation_id}`)}>
              {t("encounters.spectate")}
            </Button>
          )}
          {enc.report_id && (
            <Button size="sm" variant="ghost" onClick={() => navigate(`/reports/${enc.report_id}`)}>
              {t("encounters.report")}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
