/**
 * Defensive readers for the loosely-typed `Record<string, unknown>` payloads on
 * `Report.content` and `Evolution.diff`. The backend may shape these freely, so
 * the report/evolution views read every field through these helpers instead of
 * casting to `any` — unexpected shapes degrade to empty values rather than
 * crashing the render path.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "string" ? v : String(v))).filter(Boolean);
  }
  return [];
}

export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** A `{ name, content }` pair as used by `diff.skills_added`. */
export interface NamedContent {
  name: string;
  content: string;
}

export function asNamedContentArray(value: unknown): NamedContent[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const rec = asRecord(item);
      return { name: asString(rec.name), content: asString(rec.content) };
    })
    .filter((s) => s.name !== "" || s.content !== "");
}
