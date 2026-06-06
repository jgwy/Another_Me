import type { ReactNode } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { Evolution } from "../../lib/api";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { cn } from "../../lib/cn";
import { fadeUp, staggerContainer } from "../../lib/anim";
import { timeAgo } from "../../lib/format";
import { useApplyEvolution, useEvolutions } from "../../lib/queries";
import { asNamedContentArray, asRecord, asString, asStringArray } from "./content";

function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="text-xs font-medium uppercase tracking-wider text-faint">{children}</span>;
}

function DiffPane({ variant, text }: { variant: "before" | "after"; text: string }) {
  const { t } = useTranslation("reports");
  const before = variant === "before";
  return (
    <div className={cn("rounded-xl border px-4 py-3", before ? "border-danger/25 bg-danger/5" : "border-success/25 bg-success/5")}>
      <div className="flex items-center gap-2">
        <span className={cn("font-mono text-sm leading-none", before ? "text-danger" : "text-success")}>
          {before ? "−" : "+"}
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wider text-faint">
          {before ? t("evolution.before") : t("evolution.after")}
        </span>
      </div>
      <p className={cn("mt-1.5 text-sm leading-relaxed", before ? "text-muted" : "text-ink")}>
        {text || <span className="text-faint">—</span>}
      </p>
    </div>
  );
}

export function EvolutionDiff({ agentId, agentName }: { agentId: string; agentName: string }) {
  const { t } = useTranslation(["reports", "common"]);
  const { data: evolutions = [], isLoading } = useEvolutions(agentId);
  const apply = useApplyEvolution(agentId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  if (evolutions.length === 0) {
    return (
      <EmptyState
        icon="🧬"
        title={t("evolution.noneForTitle", { name: agentName })}
        description={t("evolution.noneForDescription")}
      />
    );
  }

  const onToggle = async (evo: Evolution) => {
    try {
      await apply.mutateAsync({ id: evo.id, applied: !evo.applied });
    } catch {
      // The demo store always resolves; live failures surface via apply.isError.
    }
  };

  return (
    <motion.div variants={staggerContainer(0.08)} initial="hidden" animate="show" className="flex flex-col gap-4">
      {evolutions.map((evo) => {
        const persona = asRecord(evo.diff.persona);
        const before = asString(persona.before);
        const after = asString(persona.after);
        const skills = asNamedContentArray(evo.diff.skills_added);
        const ruleEntries = Object.entries(asRecord(evo.diff.rules));
        const pending = apply.isPending && apply.variables?.id === evo.id;

        return (
          <motion.div key={evo.id} variants={fadeUp}>
            <Card
              glow={evo.applied}
              className={cn("flex flex-col gap-5 p-5 sm:p-6", evo.applied && "ring-1 ring-success/20")}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-soft text-brand">🧬</span>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-ink">{t("evolution.proposed")}</span>
                    <span className="text-xs text-faint">{timeAgo(evo.created_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {evo.applied ? (
                    <Badge tone="success">
                      {t("common:actions.applied")}
                      {evo.applied_at ? ` · ${timeAgo(evo.applied_at)}` : ""}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">{t("evolution.preview")}</Badge>
                  )}
                  <Button
                    size="sm"
                    variant={evo.applied ? "secondary" : "primary"}
                    loading={pending}
                    onClick={() => onToggle(evo)}
                  >
                    {evo.applied ? t("common:actions.rollback") : t("common:actions.apply")}
                  </Button>
                </div>
              </div>

              {(before || after) && (
                <div className="flex flex-col gap-2">
                  <Eyebrow>{t("evolution.persona")}</Eyebrow>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DiffPane variant="before" text={before} />
                    <DiffPane variant="after" text={after} />
                  </div>
                </div>
              )}

              {skills.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Eyebrow>{t("evolution.skillsAdded")}</Eyebrow>
                  <div className="flex flex-col gap-2">
                    {skills.map((skill, i) => (
                      <div key={i} className="rounded-xl border border-accent/25 bg-accent/5 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm leading-none text-accent">+</span>
                          <span className="text-sm font-semibold text-ink">{skill.name || t("evolution.skillFallback")}</span>
                        </div>
                        {skill.content && (
                          <p className="mt-1 text-sm leading-relaxed text-muted">{skill.content}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {ruleEntries.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Eyebrow>{t("evolution.rules")}</Eyebrow>
                  <div className="flex flex-col gap-3">
                    {ruleEntries.map(([key, value]) => {
                      const items = Array.isArray(value)
                        ? asStringArray(value)
                        : asString(value)
                          ? [asString(value)]
                          : [];
                      if (items.length === 0) return null;
                      return (
                        <div key={key} className="rounded-xl border border-border/60 bg-surface-2/50 px-4 py-3">
                          <span className="font-mono text-xs uppercase tracking-wider text-faint">{key}</span>
                          <ul className="mt-2 flex flex-col gap-1.5">
                            {items.map((item, i) => (
                              <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted">
                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
