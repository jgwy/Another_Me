/**
 * Standalone dispatch page. Reads `?agent` from the URL and forwards it to the
 * reusable {@link DispatchPanel} so deep links from an agent card or the world
 * map land with the actor pre-selected (refactor plan §6). Legacy `?scenario` /
 * `?opponent` params are intentionally ignored — the autonomous planner now
 * picks the scenes and the partners.
 */
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../components/layout/PageHeader";
import { DispatchPanel } from "./DispatchPanel";

export function DispatchPage() {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation("conversation");
  const agent = searchParams.get("agent") ?? undefined;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <PageHeader
        eyebrow={t("dispatch.page.eyebrow")}
        title={t("dispatch.page.title")}
        description={t("dispatch.page.description")}
        backTo="/agents"
        backLabel={t("dispatch.page.backLabel")}
      />
      <DispatchPanel agentId={agent} />
    </div>
  );
}
