/** Small presentation helpers shared across feature pages. */
import i18n from "../i18n";

/** Format an ISO timestamp as a short local time, e.g. "14:03". */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Format an ISO timestamp as a short date, e.g. "Jun 6". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Relative time like "2m ago" / "just now". */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  if (Number.isNaN(ms)) return "";
  const s = Math.round(ms / 1000);
  if (s < 45) return i18n.t("common:time.justNow");
  const m = Math.round(s / 60);
  if (m < 60) return i18n.t("common:time.minutesAgo", { count: m });
  const h = Math.round(m / 60);
  if (h < 24) return i18n.t("common:time.hoursAgo", { count: h });
  const days = Math.round(h / 24);
  return i18n.t("common:time.daysAgo", { count: days });
}

/** Two-letter initials from a name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Deterministic accent index (0..n-1) from any string id — for stable colors. */
export function hashIndex(value: string, buckets: number): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) >>> 0;
  }
  return buckets > 0 ? h % buckets : 0;
}

/** Clamp a number to a [min, max] range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Truncate text to `max` chars with an ellipsis. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
