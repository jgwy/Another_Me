/**
 * Focused-twin overlay. Clicking a little character in the plaza opens this to
 * see who the twin is — its avatar, tags, live status — and to act: 查看分身
 * (open the twin) or, when it is mid-encounter here, 围观对话 (spectate the live
 * conversation). Read-only; it never dispatches.
 */
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

import { popIn, spring } from "../../lib/anim";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { JOURNEY_COLOR } from "../island/worldLayout";
import type { PresenceTwin } from "./presence";

export interface TwinFocusProps {
  twin: PresenceTwin;
  onClose: () => void;
  onViewAgent: (agentId: string) => void;
  onSpectate: (conversationId: string) => void;
  reduce: boolean;
}

export function TwinFocus({ twin, onClose, onViewAgent, onSpectate, reduce }: TwinFocusProps) {
  const { t } = useTranslation(["plaza", "island", "common"]);
  const color = JOURNEY_COLOR[twin.status];
  const name = twin.is_self ? t("plaza:twin.self") : twin.agent.name;
  const tags = twin.agent.profile_tags ?? [];
  const canSpectate = !!twin.encounter_id && !!twin.conversation_id;

  return (
    <motion.div
      className="absolute inset-0 z-30 grid place-items-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.2 }}
    >
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
        <div
          className="relative p-5"
          style={{ background: `linear-gradient(160deg, color-mix(in oklab, ${color} 22%, transparent), transparent 70%)` }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="text-[0.7rem] font-medium uppercase tracking-wider text-faint">{t("plaza:twin.title")}</div>
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
            <Avatar name={twin.agent.name} avatar={twin.agent.avatar} size="lg" />
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold tracking-tight text-ink">{name}</div>
              <div className="mt-1 inline-flex items-center gap-1.5 text-xs" style={{ color }}>
                <span className="status-dot" style={{ color }} />
                {t(`island:journey.status.${twin.status}`)}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5 pb-5">
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.slice(0, 6).map((tag) => (
                <span key={tag} className="rounded-md bg-surface-2/70 px-2 py-0.5 text-xs text-muted ring-1 ring-border/50">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {twin.encounter_id && (
            <p className="rounded-xl border border-border/50 bg-surface-2/40 px-3 py-2 text-sm text-muted">
              {t("plaza:twin.inEncounter")}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" onClick={() => onViewAgent(twin.agent_id)}>
              {t("plaza:twin.viewAgent")}
            </Button>
            {canSpectate && (
              <Button size="sm" variant="secondary" onClick={() => onSpectate(twin.conversation_id!)}>
                {t("plaza:twin.spectate")}
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
