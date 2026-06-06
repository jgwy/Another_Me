import { useMemo } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { Relationship, RelationshipNode } from "../../lib/api";
import { cn } from "../../lib/cn";
import { Avatar } from "../../components/ui/Avatar";
import {
  radialLayout,
  strokeOpacityFor,
  strokeWidthFor,
  typeColorClass,
  VIEWBOX,
} from "./graphLayout";

interface RelationshipGraphProps {
  nodes: RelationshipNode[];
  edges: Relationship[];
  focusId: string | null;
  selectedEdgeId: string | null;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  reduce: boolean;
}

export function RelationshipGraph({
  nodes,
  edges,
  focusId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
  reduce,
}: RelationshipGraphProps) {
  const { t } = useTranslation("relationships");

  const placed = useMemo(() => radialLayout(nodes, focusId), [nodes, focusId]);
  const posById = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const p of placed) m.set(p.id, { x: p.x, y: p.y });
    return m;
  }, [placed]);

  // Drawable edges: both endpoints present in the current (possibly focused) view.
  const drawable = useMemo(
    () => edges.filter((e) => posById.has(e.from_agent_id) && posById.has(e.to_agent_id)),
    [edges, posById],
  );

  const selectedEdge = selectedEdgeId
    ? drawable.find((e) => e.id === selectedEdgeId) ?? null
    : null;
  const highlightedNodeIds = new Set<string>();
  if (selectedEdge) {
    highlightedNodeIds.add(selectedEdge.from_agent_id);
    highlightedNodeIds.add(selectedEdge.to_agent_id);
  }
  if (focusId) highlightedNodeIds.add(focusId);

  // A stable signature so the graph crossfades only when its shape changes.
  const shapeKey = `${focusId ?? "all"}:${placed.map((p) => p.id).join(",")}`;

  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[600px]"
      role="img"
      aria-label={t("graphLabel")}
    >
      <motion.div
        key={shapeKey}
        className="absolute inset-[9%]"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        <svg
          viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
          className="absolute inset-0 h-full w-full overflow-visible"
          aria-hidden
        >
          {drawable.map((e) => {
            const a = posById.get(e.from_agent_id)!;
            const b = posById.get(e.to_agent_id)!;
            const muted = !!selectedEdgeId && e.id !== selectedEdgeId;
            const active = e.id === selectedEdgeId;
            return (
              <g
                key={e.id}
                className={cn("cursor-pointer", typeColorClass(e.type))}
                onClick={() => onSelectEdge(e.id)}
              >
                {/* Invisible fat hit-line so thin edges are easy to click. */}
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={24} />
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth={strokeWidthFor(e.strength) * (active ? 1.4 : 1)}
                  style={{
                    opacity: muted ? 0.12 : strokeOpacityFor(e.strength),
                    transition: "opacity 0.2s ease, stroke-width 0.2s ease",
                  }}
                />
              </g>
            );
          })}
        </svg>

        {placed.map((p, i) => {
          const owned = p.node.owned;
          const highlighted = highlightedNodeIds.has(p.id);
          const dimmed = (!!selectedEdgeId || !!focusId) && !highlighted;
          return (
            <motion.div
              key={p.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${(p.x / VIEWBOX) * 100}%`, top: `${(p.y / VIEWBOX) * 100}%` }}
              initial={reduce ? false : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: dimmed ? 0.4 : 1, scale: 1 }}
              transition={
                reduce
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 320, damping: 22, delay: i * 0.03 }
              }
            >
              <button
                type="button"
                onClick={() => onSelectNode(p.id)}
                className="group flex flex-col items-center gap-1.5 focus-visible:outline-none"
                title={p.node.agent.name}
              >
                <span
                  className={cn(
                    "grid place-items-center rounded-full bg-surface transition-transform group-hover:scale-105",
                    owned ? "ring-2 ring-brand shadow-glow" : "ring-1 ring-border/70",
                    highlighted && !owned && "ring-2 ring-accent",
                  )}
                >
                  <Avatar
                    name={p.node.agent.name}
                    avatar={p.node.agent.avatar}
                    size={owned ? "md" : "sm"}
                  />
                </span>
                <span
                  className={cn(
                    "max-w-[88px] truncate rounded-md px-1.5 text-center text-xs",
                    owned ? "font-semibold text-ink" : "font-medium text-muted",
                  )}
                >
                  {p.node.agent.name}
                </span>
              </button>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
