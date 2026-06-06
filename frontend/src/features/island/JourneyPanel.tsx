/**
 * The journey read-out — a floating glass panel beside the world. Shows the
 * active trip's intent, the frog's *live* status (big localized label + hint,
 * swapped with `statusSwap` + AnimatePresence), a six-step journey stepper, and
 * the trip's encounters (partner, scene, reason, status, postcard). Clicking an
 * encounter focuses it. Memoized on the live status/index + the stable trip, so
 * it only re-renders when the journey actually advances — not every frame.
 */
import { memo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { AgentStatus, Trip } from "../../lib/trips";
import { JOURNEY_SEQUENCE, postcardText } from "../../lib/trips";
import { fadeUp, spring, staggerContainer, statusSwap } from "../../lib/anim";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { ENCOUNTER_COLOR, JOURNEY_COLOR, isSceneKey, sceneColorVar } from "./worldLayout";

export interface JourneyPanelProps {
  trip: Trip | undefined;
  liveStatus: AgentStatus;
  liveIndex: number;
  onFocusEncounter: (index: number) => void;
  onDispatch: () => void;
  reduce: boolean;
}

function JourneyPanelImpl({ trip, liveStatus, liveIndex, onFocusEncounter, onDispatch, reduce }: JourneyPanelProps) {
  const { t } = useTranslation(["island", "common"]);
  const color = JOURNEY_COLOR[liveStatus];
  // "home" lights the whole bar; "idle" lights none; else its place in sequence.
  const stepIndex =
    liveStatus === "home" ? JOURNEY_SEQUENCE.length - 1 : JOURNEY_SEQUENCE.indexOf(liveStatus);

  if (!trip) {
    return (
      <div className="glass flex flex-col gap-3 rounded-2xl p-5 shadow-float">
        <h3 className="text-sm font-semibold tracking-tight text-ink">{t("island:journey.label")}</h3>
        <p className="text-sm text-muted">{t("island:journey.noActiveTrip")}</p>
        <p className="text-xs text-faint">{t("island:journey.dispatchHint")}</p>
        <Button size="sm" onClick={onDispatch} className="mt-1 w-fit">
          {t("island:cta.dispatch")}
        </Button>
      </div>
    );
  }

  const total = trip.encounters.length;

  return (
    <div className="glass flex max-h-full flex-col gap-4 overflow-hidden rounded-2xl p-5 shadow-float">
      {/* trip header */}
      <div className="flex items-center gap-3">
        <Avatar name={trip.agent?.name ?? "?"} avatar={trip.agent?.avatar ?? null} size="sm" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-tight text-ink">
            {trip.agent?.name ?? t("island:journey.label")}
          </div>
          <div className="truncate text-xs text-faint">{trip.plan?.summary || trip.task_prompt}</div>
        </div>
      </div>

      {/* live status */}
      <div className="rounded-xl border border-border/50 bg-surface-2/40 p-3.5">
        <div className="flex items-center gap-1.5 text-[0.7rem] font-medium uppercase tracking-wider text-faint">
          <span className="status-dot" style={{ color }} />
          {t("island:journey.label")}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={liveStatus}
            variants={reduce ? undefined : statusSwap}
            initial={reduce ? false : "hidden"}
            animate={reduce ? undefined : "show"}
            exit={reduce ? undefined : "exit"}
            className="mt-1.5"
          >
            <div className="text-lg font-semibold tracking-tight" style={{ color }}>
              {t(`island:journey.status.${liveStatus}`)}
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              {t(`island:journey.statusHint.${liveStatus}`)}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* six-step journey stepper */}
        <div className="mt-3 flex items-center gap-1.5">
          {JOURNEY_SEQUENCE.map((s, i) => (
            <span
              key={s}
              className="h-1.5 flex-1 rounded-full transition-colors"
              style={{
                backgroundColor: i <= stepIndex ? JOURNEY_COLOR[s] : "var(--color-border)",
                opacity: i <= stepIndex ? 1 : 0.5,
              }}
            />
          ))}
        </div>
      </div>

      {/* encounters */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-ink">{t("island:journey.encounters")}</h3>
        <span className="text-xs text-faint">{t("island:journey.encounterCount", { count: total })}</span>
      </div>

      <motion.ul
        variants={reduce ? undefined : staggerContainer(0.06)}
        initial={reduce ? undefined : "hidden"}
        animate={reduce ? undefined : "show"}
        className="-mr-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1"
      >
        {trip.encounters.map((enc) => {
          const encColor = ENCOUNTER_COLOR[enc.status];
          const isCurrent = enc.seq === liveIndex;
          const reason = enc.match_reasons[0] ?? "";
          const postcard = postcardText(enc.postcard);
          const partnerName = enc.opponent?.name ?? "?";
          const sceneLabel = isSceneKey(enc.scenario_key)
            ? t(`island:scenarios.${enc.scenario_key}`)
            : enc.scenario_key ?? "";
          return (
            <motion.li key={enc.id} variants={reduce ? undefined : fadeUp} transition={spring.soft}>
              <button
                type="button"
                onClick={() => onFocusEncounter(enc.seq)}
                className="group flex w-full items-start gap-3 rounded-xl border bg-surface-2/40 px-3 py-2.5 text-left transition-colors hover:bg-surface-2/80"
                style={{ borderColor: isCurrent ? color : "color-mix(in oklab, var(--color-border) 55%, transparent)" }}
              >
                <Avatar name={partnerName} avatar={enc.opponent?.avatar ?? null} size="xs" className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm text-ink">{partnerName}</span>
                    {sceneLabel && (
                      <span className="chip shrink-0" style={{ color: sceneColorVar(enc.scenario_key) }}>
                        {sceneLabel}
                      </span>
                    )}
                  </div>
                  {reason && <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">{reason}</p>}
                  {postcard && <p className="mt-1 text-xs italic text-faint">“{postcard}”</p>}
                </div>
                <span className="mt-1 flex shrink-0 items-center gap-1 text-[0.7rem]" style={{ color: encColor }}>
                  <span className="status-dot" style={{ color: encColor }} />
                  {t(`island:journey.encounterStatus.${enc.status}`)}
                </span>
              </button>
            </motion.li>
          );
        })}
      </motion.ul>
    </div>
  );
}

export const JourneyPanel = memo(JourneyPanelImpl);
