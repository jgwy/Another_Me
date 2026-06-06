import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { Report } from "../../lib/api";
import { Card } from "../../components/ui/Card";
import { fadeUp, staggerContainer } from "../../lib/anim";
import { asStringArray } from "./content";

interface EmpathySection {
  key: string;
  title: string;
  icon: string;
  items: string[];
}

export function EmpathyReport({ report }: { report: Report }) {
  const { t } = useTranslation("reports");
  const content = report.content;
  const sections: EmpathySection[] = [
    { key: "common", title: t("empathy.commonGround"), icon: "🤝", items: asStringArray(content.common_ground) },
    {
      key: "insights",
      title: t("empathy.emotionalInsights"),
      icon: "💗",
      items: asStringArray(content.emotional_insights),
    },
    { key: "takeaways", title: t("empathy.takeaways"), icon: "✨", items: asStringArray(content.takeaways) },
  ].filter((section) => section.items.length > 0);

  if (sections.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted">{t("empathy.empty")}</p>
    );
  }

  return (
    <motion.div
      variants={staggerContainer(0.08)}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-5"
    >
      {sections.map((section) => (
        <motion.div key={section.key} variants={fadeUp}>
          <Card className="overflow-hidden p-0">
            <div className="flex items-center gap-3 border-b border-accent/15 bg-accent/5 px-5 py-3.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/10 text-lg ring-1 ring-accent/20">
                {section.icon}
              </span>
              <h3 className="text-sm font-semibold tracking-tight text-ink">{section.title}</h3>
            </div>
            <ul className="flex flex-col gap-3 px-5 py-4">
              {section.items.map((item, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
}
