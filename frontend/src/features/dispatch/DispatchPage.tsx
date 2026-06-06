/**
 * Standalone dispatch page. Reads `?agent`, `?scenario`, and `?opponent` from the
 * URL and forwards them to the reusable {@link DispatchPanel}, so deep links from
 * an agent card or the island map land pre-configured (R5, R6).
 */
import { useSearchParams } from "react-router-dom";

import { PageHeader } from "../../components/layout/PageHeader";
import { DispatchPanel } from "./DispatchPanel";

export function DispatchPage() {
  const [searchParams] = useSearchParams();
  const agent = searchParams.get("agent") ?? undefined;
  const scenario = searchParams.get("scenario") ?? undefined;
  const opponent = searchParams.get("opponent") ?? undefined;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <PageHeader
        eyebrow="Dispatch"
        title="Dispatch to the island"
        description="Choose a twin, set the task, pick a scene, and decide who it faces. We'll take you straight to the live conversation."
        backTo="/agents"
        backLabel="Agents"
      />
      <DispatchPanel agentId={agent} scenarioKey={scenario} opponentId={opponent} />
    </div>
  );
}
