import type { Notification, NotificationKind } from "../../lib/api";
import type { BadgeTone } from "../../components/ui/Badge";

/** Per-kind visual language: a Badge tone + a small glyph for the row marker. */
interface KindMeta {
  tone: BadgeTone;
  icon: string;
}

export const KIND_META: Record<NotificationKind, KindMeta> = {
  trip_completed: { tone: "brand", icon: "🧭" },
  encounter_completed: { tone: "accent", icon: "🤝" },
  report_ready: { tone: "success", icon: "📝" },
  postcard: { tone: "accent", icon: "💌" },
  relationship_update: { tone: "brand", icon: "🕸️" },
  marketplace: { tone: "warning", icon: "🛍️" },
  system: { tone: "neutral", icon: "🔔" },
};

export interface OpenTarget {
  to: string;
  /** i18n key in the `inbox` namespace, e.g. `open.report`. */
  labelKey: string;
}

/**
 * Resolve where a notification opens.
 *
 * The two "social" kinds map to their surface by kind — a `relationship_update`
 * is really about the graph, a `marketplace` notice about the market — even
 * when they also carry incidental context (e.g. the conversation that formed a
 * tie). Every other kind opens the most specific artifact present in `data`,
 * by precedence (report → conversation → trip → agent). Returns `null` when
 * there is nothing meaningful to open (e.g. a bare `system` notice).
 */
export function resolveOpenTarget(n: Notification): OpenTarget | null {
  if (n.kind === "relationship_update") return { to: "/relationships", labelKey: "open.relationships" };
  if (n.kind === "marketplace") return { to: "/marketplace", labelKey: "open.marketplace" };

  const d = n.data ?? {};
  if (d.report_id) return { to: `/reports/${d.report_id}`, labelKey: "open.report" };
  if (d.conversation_id) {
    return { to: `/conversations/${d.conversation_id}`, labelKey: "open.conversation" };
  }
  if (d.trip_id) return { to: `/trips/${d.trip_id}`, labelKey: "open.trip" };
  if (d.item_id) return { to: "/marketplace", labelKey: "open.marketplace" };
  if (d.agent_id) return { to: `/agents/${d.agent_id}`, labelKey: "open.agent" };
  return null;
}
