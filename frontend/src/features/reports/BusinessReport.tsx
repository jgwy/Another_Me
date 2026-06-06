import type { ReactNode } from "react";
import { motion } from "motion/react";
import type { Report } from "../../lib/api";
import type { BadgeTone } from "../../components/ui/Badge";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { cn } from "../../lib/cn";
import { fadeUp, staggerContainer } from "../../lib/anim";
import { asString, asStringArray } from "./content";

/** Infer a verdict colour from the free-text recommendation. */
function recommendationTone(text: string): BadgeTone {
  const t = text.toLowerCase();
  if (/(strong yes|hard yes|\byes\b|\bback\b|invest|proceed|fund)/.test(t)) return "success";
  if (/(\bno\b|\bpass\b|decline|reject|avoid|walk away)/.test(t)) return "danger";
  return "warning";
}

const RECO_BANNER: Record<BadgeTone, string> = {
  success: "border-success/30 bg-success/10",
  danger: "border-danger/30 bg-danger/10",
  warning: "border-warning/30 bg-warning/10",
  brand: "border-brand/30 bg-brand-soft",
  accent: "border-accent/30 bg-accent/10",
  neutral: "border-border/60 bg-surface-2/60",
};

function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="text-xs font-medium uppercase tracking-wider text-faint">{children}</span>;
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="m5 13 4 4L19 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BusinessReport({ report }: { report: Report }) {
  const content = report.content;
  const feasibility = asString(content.feasibility);
  const valuationLean = asString(content.valuation_lean);
  const recommendation = asString(content.recommendation);
  const risks = asStringArray(content.risks);
  const highlights = asStringArray(content.highlights);
  const tone = recommendationTone(recommendation);

  return (
    <motion.div
      variants={staggerContainer(0.07)}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-5"
    >
      {recommendation && (
        <motion.div variants={fadeUp}>
          <div className={cn("relative overflow-hidden rounded-2xl border p-5 sm:p-6", RECO_BANNER[tone])}>
            <Badge tone={tone}>建议 · Recommendation</Badge>
            <p className="mt-3 text-lg font-semibold leading-snug text-ink">{recommendation}</p>
          </div>
        </motion.div>
      )}

      {feasibility && (
        <motion.div variants={fadeUp}>
          <Card className="p-5 sm:p-6">
            <Eyebrow>可行性 · Feasibility</Eyebrow>
            <p className="mt-2 text-sm leading-relaxed text-muted">{feasibility}</p>
          </Card>
        </motion.div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {risks.length > 0 && (
          <motion.div variants={fadeUp}>
            <Card className="h-full p-5 sm:p-6">
              <Eyebrow>风险 · Risks</Eyebrow>
              <ul className="mt-3 flex flex-col gap-3">
                {risks.map((risk, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </motion.div>
        )}

        {highlights.length > 0 && (
          <motion.div variants={fadeUp}>
            <Card className="h-full p-5 sm:p-6">
              <Eyebrow>亮点 · Highlights</Eyebrow>
              <ul className="mt-3 flex flex-col gap-3">
                {highlights.map((highlight, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </motion.div>
        )}
      </div>

      {valuationLean && (
        <motion.div variants={fadeUp}>
          <Card className="p-5 sm:p-6">
            <Eyebrow>估值倾向 · Valuation lean</Eyebrow>
            <p className="mt-2 text-sm leading-relaxed text-muted">{valuationLean}</p>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
