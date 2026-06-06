import type { Relationship, RelationshipNode } from "../../lib/api";

/* -------------------------------------------------------------------------- */
/* Relationship-type visual language                                          */
/* -------------------------------------------------------------------------- */

/** The canonical types we colour explicitly; anything else maps to `other`. */
export const KNOWN_TYPES = [
  "ally",
  "mentor",
  "rival",
  "friend",
  "acquaintance",
  "collaborator",
  "other",
] as const;

export type KnownType = (typeof KNOWN_TYPES)[number];

/**
 * A Tailwind text-colour class per type. SVG strokes read it via
 * `stroke="currentColor"`, legend swatches via `bg-current` — so a type's
 * colour stays identical wherever it appears.
 */
const TYPE_COLOR: Record<KnownType, string> = {
  ally: "text-brand",
  mentor: "text-warning",
  rival: "text-danger",
  friend: "text-accent",
  acquaintance: "text-faint",
  collaborator: "text-sky-400",
  other: "text-muted",
};

export function normalizeType(type: string): KnownType {
  return (KNOWN_TYPES as readonly string[]).includes(type) ? (type as KnownType) : "other";
}

export function typeColorClass(type: string): string {
  return TYPE_COLOR[normalizeType(type)];
}

/** Distinct, ordered types present in a set of edges (for the legend). */
export function typesInEdges(edges: Relationship[]): KnownType[] {
  const seen = new Set<KnownType>();
  for (const e of edges) seen.add(normalizeType(e.type));
  return KNOWN_TYPES.filter((tp) => seen.has(tp));
}

/* -------------------------------------------------------------------------- */
/* Radial layout                                                              */
/* -------------------------------------------------------------------------- */

/** SVG user-space canvas — square so the radial layout stays circular. */
export const VIEWBOX = 1000;
const CENTER = VIEWBOX / 2;

export interface PlacedNode {
  id: string;
  node: RelationshipNode;
  /** Position in SVG user space (0..VIEWBOX). */
  x: number;
  y: number;
}

function placeRing(
  ids: { id: string; node: RelationshipNode }[],
  radius: number,
  rotation: number,
): PlacedNode[] {
  const n = ids.length;
  if (n === 0) return [];
  if (n === 1) {
    // A lone node on a ring reads better slightly above centre than buried in it.
    return [{ ...ids[0]!, x: CENTER, y: CENTER - radius }];
  }
  return ids.map((item, i) => {
    const angle = rotation - Math.PI / 2 + (i / n) * Math.PI * 2;
    return {
      ...item,
      x: CENTER + radius * Math.cos(angle),
      y: CENTER + radius * Math.sin(angle),
    };
  });
}

/**
 * Place nodes radially.
 *  - Focused: the focused twin sits at the centre, its neighbours ring it.
 *  - Otherwise: owned twins form a highlighted inner ring; the rest radiate
 *    out on an outer ring. With only one cohort present, everything shares a
 *    single ring. Degrades to centre/empty for the 0–1 node cases.
 */
export function radialLayout(nodes: RelationshipNode[], focusId?: string | null): PlacedNode[] {
  const items = nodes.map((node) => ({ id: node.agent.id, node }));
  if (items.length === 0) return [];
  if (items.length === 1) return [{ ...items[0]!, x: CENTER, y: CENTER }];

  if (focusId && items.some((it) => it.id === focusId)) {
    const focus = items.find((it) => it.id === focusId)!;
    const rest = items.filter((it) => it.id !== focusId);
    return [
      { ...focus, x: CENTER, y: CENTER },
      ...placeRing(rest, 360, 0),
    ];
  }

  const owned = items.filter((it) => it.node.owned);
  const others = items.filter((it) => !it.node.owned);

  if (owned.length > 0 && others.length > 0) {
    return [
      ...placeRing(owned, owned.length === 1 ? 0 : 200, 0),
      // Offset the outer ring half a step so spokes don't visually align.
      ...placeRing(others, 400, Math.PI / Math.max(others.length, 1)),
    ];
  }

  return placeRing(items, 380, 0);
}

/** Map an edge's strength (0..1) to a crisp stroke width in user-space units. */
export function strokeWidthFor(strength: number): number {
  const s = Math.max(0, Math.min(1, strength));
  return 2 + s * 7;
}

/** Map strength to a legible stroke opacity. */
export function strokeOpacityFor(strength: number): number {
  const s = Math.max(0, Math.min(1, strength));
  return 0.3 + s * 0.55;
}
