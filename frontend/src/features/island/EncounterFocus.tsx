/**
 * Focused-encounter overlay. Opening an encounter (by clicking a partner, the
 * frog, or a panel row) spectates/reads it — never dispatches. Shows the
 * partner, the scene, why this match, any risks, the postcard, and the two
 * navigations the contract supports: 围观/Spectate → the conversation, and
 * 查看报告/View report → its report. Both resolve by `conversation_id`, matching
 * the locked routes (`/conversations/:id` and `/conversations/:id/report`).
 */
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { TripEncounter } from "../../lib/trips";
import { postcardText } from "../../lib/trips";
import { popIn, spring } from "../../lib/anim";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ENCOUNTER_COLOR, isSceneKey, sceneColorVar } from "./worldLayout";

export interface EncounterFocusProps {
  encounter: TripEncounter;
  onClose: () => void;
  onSpectate: (conversationId: string) => void;
  onReport: (conversationId: string) => void;
  reduce: boolean;
}

export function EncounterFocus({ encounter, onClose, onSpectate, onReport, reduce }: EncounterFocusProps) {
  const { t } = useTranslation(["island", "common"]);
  const sceneColor = sceneColorVar(encounter.scenario_key);
  const statusColor = ENCOUNTER_COLOR[encounter.status];
  const canSpectate = !!encounter.conversation_id;
  const canReport = !!encounter.conversation_id && !!encounter.report_id;
  const partner = encounter.opponent;
  const partnerName = partner?.name ?? "?";
  const reasons = encounter.match_reasons;
  const risks = encounter.match_risks;
  const postcard = postcardText(encounter.postcard);
  const sceneLabel = isSceneKey(encounter.scenario_key)
    ? t(`island:scenarios.${encounter.scenario_key}`)
    : encounter.scenario_key ?? "";

  return (
    <motion.div
      className="absolute inset-0 z-30 grid place-items-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.2 }}
    >
      {/* backdrop */}
      <button
        type="button"
        aria-label={t("common:actions.close")}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-canvas/55 backdrop-blur-sm"
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        variants={reduce ? undefined : popIn}
        initial={reduce ? false : "hidden"}
        animate={reduce ? undefined : "show"}
        transition={spring.soft}
        className="glass relative z-10 w-full max-w-md overflow-hidden rounded-3xl shadow-float"
      >
        {/* scene-tinted header */}
        <div className="relative p-5" style={{ background: `linear-gradient(160deg, color-mix(in oklab, ${sceneColor} 22%, transparent), transparent 70%)` }}>
          <div className="flex items-start justify-between gap-3">
            <div className="text-[0.7rem] font-medium uppercase tracking-wider text-faint">
              {t("island:world.focus")}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common:actions.close")}
              className="grid h-7 w-7 place-items-center rounded-full bg-surface-2/70 text-muted transition-colors hover:text-ink"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <Avatar name={partnerName} avatar={partner?.avatar ?? null} size="lg" />
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold tracking-tight text-ink">{partnerName}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {sceneLabel && (
                  <span className="chip" style={{ color: sceneColor }}>
                    {sceneLabel}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-xs" style={{ color: statusColor }}>
                  <span className="status-dot" style={{ color: statusColor }} />
                  {t(`island:journey.encounterStatus.${encounter.status}`)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5 pb-5">
          {/* partner tags */}
          {(partner?.profile_tags?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {partner!.profile_tags.slice(0, 6).map((tag) => (
                <span key={tag} className="rounded-md bg-surface-2/70 px-2 py-0.5 text-xs text-muted ring-1 ring-border/50">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* why here */}
          {reasons.length > 0 && (
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-faint">{t("island:journey.reason")}</div>
              {reasons.length === 1 ? (
                <p className="mt-1 text-sm leading-relaxed text-ink">{reasons[0]}</p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1">
                  {reasons.map((reason) => (
                    <li key={reason} className="flex items-start gap-1.5 text-sm text-ink">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                      {reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* risks */}
          {risks.length > 0 && (
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-faint">{t("island:journey.risks")}</div>
              <ul className="mt-1 flex flex-col gap-1">
                {risks.map((risk) => (
                  <li key={risk} className="flex items-start gap-1.5 text-sm text-muted">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning" />
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* postcard */}
          {postcard && (
            <div className="rounded-xl border border-border/50 bg-surface-2/40 p-3">
              <div className="text-xs font-medium uppercase tracking-wider text-faint">{t("island:journey.postcardLabel")}</div>
              <p className="mt-1 text-sm italic leading-relaxed text-ink">“{postcard}”</p>
            </div>
          )}

          {/* actions */}
          {canSpectate ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button size="sm" onClick={() => onSpectate(encounter.conversation_id!)}>
                {t("island:world.spectate")}
              </Button>
              {canReport && (
                <Button size="sm" variant="secondary" onClick={() => onReport(encounter.conversation_id!)}>
                  {t("island:world.viewReport")}
                </Button>
              )}
              <Badge tone="success" className="ml-auto">
                {t("common:status.completed")}
              </Badge>
            </div>
          ) : (
            <p className="pt-1 text-xs text-faint">{t("island:world.upcomingHint")}</p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
