import { useTranslation } from "react-i18next";
import type { Report } from "../../lib/api";
import { Card } from "../../components/ui/Card";
import { asString, asStringArray } from "./content";

/** Title-case a free-form content key, e.g. `valuation_lean` → `Valuation Lean`. */
export function humanize(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Fallback for `generic` reports: render whatever the content map holds. */
export function GenericReport({ report }: { report: Report }) {
  const { t } = useTranslation("reports");
  const entries = Object.entries(report.content);
  const rendered = entries.filter(
    ([, value]) => asStringArray(value).length > 0 || asString(value) !== "",
  );

  if (rendered.length === 0) {
    return <p className="text-sm leading-relaxed text-muted">{t("report.noBreakdown")}</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {rendered.map(([key, value]) => {
        const list = asStringArray(value);
        const text = asString(value);
        return (
          <Card key={key} className="p-5 sm:p-6">
            <span className="text-xs font-medium uppercase tracking-wider text-faint">{humanize(key)}</span>
            {list.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2">
                {list.map((item, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
