import { Link, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import { useReport } from "../../lib/queries";
import { fadeUp, spring } from "../../lib/anim";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { ReportBody } from "./ReportBody";

function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-32 w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}

/**
 * Render a report by its own id. Handles trip-level `trip_summary` reports
 * (whose `conversation_id` is null) alongside per-encounter reports — for the
 * latter we surface a link back to the full conversation report (transcript +
 * evolution). The back link always returns to the world.
 */
export function ReportByIdPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation(["reports", "common"]);
  const reduce = useReducedMotion() ?? false;

  const { data: report, isLoading } = useReport(id);

  const title =
    report?.kind === "trip_summary"
      ? t("reports:tripSummary.title")
      : t("reports:page.fallbackTitle");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={t("reports:page.eyebrow")}
        title={title}
        backTo="/"
        backLabel={t("reports:page.backHome")}
        actions={
          report?.conversation_id ? (
            <Link to={`/conversations/${report.conversation_id}/report`}>
              <Button variant="secondary" size="sm">
                {t("reports:report.viewFullReport")}
              </Button>
            </Link>
          ) : undefined
        }
      />

      {isLoading ? (
        <ReportSkeleton />
      ) : !report ? (
        <EmptyState
          icon="📝"
          title={t("reports:report.generatingTitle")}
          description={t("reports:report.generatingDescription")}
        />
      ) : (
        <motion.div
          variants={reduce ? undefined : fadeUp}
          initial={reduce ? undefined : "hidden"}
          animate={reduce ? undefined : "show"}
          transition={spring.soft}
        >
          <ReportBody report={report} />
        </motion.div>
      )}
    </div>
  );
}
