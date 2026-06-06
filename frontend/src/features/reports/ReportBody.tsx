import { useTranslation } from "react-i18next";
import type { Report, ReportKind } from "../../lib/api";
import type { BadgeTone } from "../../components/ui/Badge";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { BusinessReport } from "./BusinessReport";
import { EmpathyReport } from "./EmpathyReport";
import { GenericReport } from "./GenericReport";
import { TripSummaryReport } from "./TripSummaryReport";

export const KIND_TONE: Record<ReportKind, BadgeTone> = {
  business: "brand",
  empathy: "accent",
  generic: "neutral",
  trip_summary: "accent",
};

/**
 * Shared report renderer: a glowing summary hero + the kind-specific body.
 * Consumed by both the per-conversation `ReportPage` tab and the by-id
 * `ReportByIdPage` so every report kind renders identically wherever it opens.
 */
export function ReportBody({ report }: { report: Report }) {
  const { t } = useTranslation("reports");
  return (
    <div className="flex flex-col gap-6">
      <Card glow className="p-5 sm:p-6">
        <Badge tone={KIND_TONE[report.kind]}>{t(`kind.${report.kind}`)}</Badge>
        <p className="mt-3 text-base leading-relaxed text-ink sm:text-lg">{report.summary}</p>
      </Card>

      {report.kind === "business" ? (
        <BusinessReport report={report} />
      ) : report.kind === "empathy" ? (
        <EmpathyReport report={report} />
      ) : report.kind === "trip_summary" ? (
        <TripSummaryReport report={report} />
      ) : (
        <GenericReport report={report} />
      )}
    </div>
  );
}
