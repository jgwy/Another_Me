import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { AgentSummary, Relationship } from "../../lib/api";
import { useRelationshipGraph } from "../../lib/queries";
import { cn } from "../../lib/cn";
import { clamp } from "../../lib/format";
import { PageHeader } from "../../components/layout/PageHeader";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { RelationshipGraph } from "./RelationshipGraph";
import { normalizeType, typeColorClass, typesInEdges } from "./graphLayout";

function otherAgent(edge: Relationship, nodeId: string): AgentSummary | null {
  if (edge.from_agent_id === nodeId) return edge.to_agent;
  if (edge.to_agent_id === nodeId) return edge.from_agent;
  return null;
}

function StrengthMeter({ value, colorClass }: { value: number; colorClass: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div
        className={cn("h-full rounded-full bg-current", colorClass)}
        style={{ width: `${Math.round(clamp(value, 0, 1) * 100)}%` }}
      />
    </div>
  );
}

function TypePill({ type }: { type: string }) {
  const { t } = useTranslation("relationships");
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
      <span className={typeColorClass(type)}>
        <span className="status-dot" />
      </span>
      {t(`types.${normalizeType(type)}`)}
    </span>
  );
}

function Legend({ edges }: { edges: Relationship[] }) {
  const { t } = useTranslation("relationships");
  const types = typesInEdges(edges);
  if (types.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-wider text-faint">{t("legend")}</span>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {types.map((tp) => (
          <span key={tp} className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span className={typeColorClass(tp)}>
              <span className="status-dot" />
            </span>
            {t(`types.${tp}`)}
          </span>
        ))}
      </div>
    </div>
  );
}

function EdgeDetail({ edge, onBack }: { edge: Relationship; onBack: () => void }) {
  const { t } = useTranslation("relationships");
  const color = typeColorClass(edge.type);
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1 text-xs text-muted transition-colors hover:text-ink"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t("clearFocus")}
      </button>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2">
          <Avatar name={edge.from_agent?.name ?? "?"} avatar={edge.from_agent?.avatar} size="sm" />
          <span className="text-sm font-medium text-ink">{edge.from_agent?.name ?? "—"}</span>
        </div>
        <span className={cn("text-faint", color)} aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div className="flex items-center gap-2">
          <Avatar name={edge.to_agent?.name ?? "?"} avatar={edge.to_agent?.avatar} size="sm" />
          <span className="text-sm font-medium text-ink">{edge.to_agent?.name ?? "—"}</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <TypePill type={edge.type} />
        <span className="text-xs text-faint">{t("encounters", { count: edge.encounters_count })}</span>
      </div>

      {edge.label && <p className="text-sm leading-relaxed text-muted">{edge.label}</p>}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-faint">{t("stats.strength")}</span>
          <span className="font-medium text-ink">{t("edge.strength", { value: edge.strength.toFixed(2) })}</span>
        </div>
        <StrengthMeter value={edge.strength} colorClass={color} />
      </div>

      {edge.last_conversation_id && (
        <Link to={`/conversations/${edge.last_conversation_id}`} className="w-full">
          <Button variant="secondary" size="sm" className="w-full">
            {t("viewConversation")}
          </Button>
        </Link>
      )}
    </div>
  );
}

function NodeDetail({
  node,
  edges,
  onSelectEdge,
}: {
  node: AgentSummary & { owned: boolean };
  edges: Relationship[];
  onSelectEdge: (id: string) => void;
}) {
  const { t } = useTranslation("relationships");
  const mine = edges.filter((e) => e.from_agent_id === node.id || e.to_agent_id === node.id);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar name={node.name} avatar={node.avatar} size="md" />
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-ink">{node.name}</span>
          <Badge tone={node.owned ? "brand" : "neutral"}>{node.owned ? t("you") : t("others")}</Badge>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-faint">{t("connections")}</span>
        <ul className="flex flex-col gap-1">
          {mine.map((e) => {
            const other = otherAgent(e, node.id);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onSelectEdge(e.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-2/60"
                >
                  <Avatar name={other?.name ?? "?"} avatar={other?.avatar} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{other?.name ?? "—"}</span>
                  <span className={typeColorClass(e.type)}>
                    <span className="status-dot" />
                  </span>
                  <span className="text-xs tabular-nums text-faint">{e.strength.toFixed(2)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function RelationshipsPage() {
  const { t } = useTranslation(["relationships", "common"]);
  const reduce = useReducedMotion() ?? false;

  const { data, isLoading } = useRelationshipGraph();
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const fullNodes = data?.nodes ?? [];
  const fullEdges = data?.edges ?? [];

  // Focused view: filter locally to the focused twin + its immediate neighbours.
  const view = useMemo(() => {
    if (!focusId) return { nodes: fullNodes, edges: fullEdges };
    const edges = fullEdges.filter((e) => e.from_agent_id === focusId || e.to_agent_id === focusId);
    const ids = new Set<string>([focusId]);
    for (const e of edges) {
      ids.add(e.from_agent_id);
      ids.add(e.to_agent_id);
    }
    return { nodes: fullNodes.filter((n) => ids.has(n.agent.id)), edges };
  }, [focusId, fullNodes, fullEdges]);

  const selectedEdge = selectedEdgeId
    ? fullEdges.find((e) => e.id === selectedEdgeId) ?? null
    : null;
  const focusedNode = focusId ? fullNodes.find((n) => n.agent.id === focusId) ?? null : null;

  const handleSelectNode = (id: string) => {
    setFocusId((prev) => (prev === id ? prev : id));
    setSelectedEdgeId(null);
  };
  const handleReset = () => {
    setFocusId(null);
    setSelectedEdgeId(null);
  };

  const header = (
    <PageHeader
      eyebrow={t("relationships:page.eyebrow")}
      title={t("relationships:page.title")}
      description={t("relationships:page.description")}
      actions={
        focusId ? (
          <Button variant="secondary" size="sm" onClick={handleReset}>
            {t("relationships:clearFocus")}
          </Button>
        ) : undefined
      }
    />
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8">
        {header}
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Skeleton className="mx-auto aspect-square w-full max-w-[600px] rounded-3xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (fullNodes.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        {header}
        <EmptyState
          icon="🕸️"
          title={t("relationships:empty.title")}
          description={t("relationships:empty.description")}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {header}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="relative overflow-hidden p-4 sm:p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,color-mix(in_oklab,var(--color-brand)_12%,transparent),transparent_60%)]" />
          <div className="relative">
            <RelationshipGraph
              nodes={view.nodes}
              edges={view.edges}
              focusId={focusId}
              selectedEdgeId={selectedEdgeId}
              onSelectNode={handleSelectNode}
              onSelectEdge={setSelectedEdgeId}
              reduce={reduce}
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex items-center gap-3 text-sm text-muted">
            <span>{t("relationships:stats.nodes", { count: fullNodes.length })}</span>
            <span className="h-3 w-px bg-border/70" aria-hidden />
            <span>{t("relationships:stats.edges", { count: fullEdges.length })}</span>
          </div>

          <Legend edges={fullEdges} />

          <div className="h-px w-full bg-border/50" aria-hidden />

          {selectedEdge ? (
            <EdgeDetail edge={selectedEdge} onBack={() => setSelectedEdgeId(null)} />
          ) : focusedNode ? (
            <NodeDetail
              node={{ ...focusedNode.agent, owned: focusedNode.owned }}
              edges={fullEdges}
              onSelectEdge={setSelectedEdgeId}
            />
          ) : (
            <p className="text-sm leading-relaxed text-muted">{t("relationships:hint")}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
