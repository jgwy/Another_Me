/**
 * 捏脸 (build-a-twin) entry point with three ways in (plan §3):
 *
 * - **问卷** — the guided multi-step {@link QuestionnaireWizard}.
 * - **自然语言引导** — describe the person; AI drafts an editable brain.
 * - **粘贴语料** — paste chats/writing; distill a twin from it.
 *
 * The page owns only the header + the entry-mode selector and hands off to the
 * matching flow; each flow owns its own state and submit.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import { spring, fadeUp, staggerContainer } from "../../lib/anim";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/layout/PageHeader";

import { QuestionnaireWizard } from "./QuestionnaireWizard";
import { GenerateFlow } from "./GenerateFlow";

type EntryMode = "questionnaire" | "nl" | "corpus";

const MODES: { id: EntryMode; icon: ReactNode }[] = [
  { id: "questionnaire", icon: "📝" },
  { id: "nl", icon: "✨" },
  { id: "corpus", icon: "📋" },
];

export function CreateAgentPage() {
  const { t } = useTranslation(["create", "common"]);
  const reduce = useReducedMotion() ?? false;
  const [mode, setMode] = useState<EntryMode>("questionnaire");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={t("page.eyebrow")}
        title={t("page.title")}
        description={t("page.description")}
        backTo="/agents"
        backLabel={t("page.backLabel")}
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium tracking-wide text-muted">{t("mode.label")}</span>
          <span className="text-xs text-faint">{t("mode.hint")}</span>
        </div>
        <motion.div
          className="grid gap-3 sm:grid-cols-3"
          variants={staggerContainer(0.05)}
          initial={reduce ? false : "hidden"}
          animate="show"
        >
          {MODES.map((m) => {
            const active = mode === m.id;
            return (
              <motion.button
                key={m.id}
                type="button"
                variants={reduce ? undefined : fadeUp}
                transition={spring.soft}
                whileHover={reduce ? undefined : { y: -2 }}
                whileTap={reduce ? undefined : { scale: 0.98 }}
                onClick={() => setMode(m.id)}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-2xl p-4 text-left ring-1 transition-colors",
                  active
                    ? "bg-brand-soft ring-brand/50"
                    : "bg-surface-2/40 ring-border/40 hover:bg-surface-2/70 hover:ring-border",
                )}
              >
                <span
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-xl text-xl transition-colors",
                    active ? "bg-brand/15 ring-1 ring-brand/30" : "bg-surface-2/70 ring-1 ring-border/50",
                  )}
                  aria-hidden
                >
                  {m.icon}
                </span>
                <span className={cn("text-sm font-semibold", active ? "text-brand" : "text-ink")}>
                  {t(`mode.${m.id}.title`)}
                </span>
                <span className="text-xs leading-relaxed text-muted">{t(`mode.${m.id}.description`)}</span>
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={mode}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: reduce ? 0 : 0.18 }}
        >
          {mode === "questionnaire" ? <QuestionnaireWizard /> : <GenerateFlow mode={mode} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
