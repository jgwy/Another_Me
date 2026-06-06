import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { Report } from "../../lib/api";
import { Card } from "../../components/ui/Card";
import { fadeUp, staggerContainer } from "../../lib/anim";
import { asRecord, asString, asStringArray, isRecord } from "./content";
import { humanize } from "./GenericReport";

/** Records inside an array — e.g. structured `encounters` / `postcards`. */
function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/** First non-empty string among several candidate keys. */
function pick(rec: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = asString(rec[k]);
    if (v) return v;
  }
  return "";
}

function hasContent(value: unknown): boolean {
  if (asStringArray(value).length > 0 || asString(value) !== "") return true;
  if (asRecordArray(value).length > 0) return true;
  if (isRecord(value) && Object.keys(value).length > 0) return true;
  return typeof value === "number" || typeof value === "boolean";
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <span className="text-xs font-medium uppercase tracking-wider text-faint">{title}</span>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function BulletList({ items, dot = "bg-accent" }: { items: string[]; dot?: string }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted">
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Postcards — render strings or `{text, from}` records as quote cards. */
function Postcards({ value }: { value: unknown }) {
  const records = asRecordArray(value);
  const cards = records.length > 0
    ? records.map((r) => ({ text: pick(r, ["text", "quote", "message", "body"]), from: pick(r, ["from", "author", "agent"]) }))
    : asStringArray(value).map((text) => ({ text, from: "" }));
  const valid = cards.filter((c) => c.text);
  if (valid.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {valid.map((c, i) => (
        <figure
          key={i}
          className="flex flex-col gap-2 rounded-2xl border border-accent/20 bg-accent/5 p-4"
        >
          <span className="text-lg leading-none text-accent" aria-hidden>“</span>
          <blockquote className="text-sm leading-relaxed text-ink">{c.text}</blockquote>
          {c.from && <figcaption className="text-xs text-faint">— {c.from}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

/** Encounters — render strings or `{title, partner, summary}` records as cards. */
function Encounters({ value }: { value: unknown }) {
  const records = asRecordArray(value);
  if (records.length > 0) {
    const items = records
      .map((r) => ({
        title: pick(r, ["title", "scenario", "name", "place"]),
        partner: pick(r, ["partner", "opponent", "with", "counterpart"]),
        summary: pick(r, ["summary", "takeaway", "outcome", "note", "description"]),
      }))
      .filter((e) => e.title || e.partner || e.summary);
    if (items.length === 0) return null;
    return (
      <div className="flex flex-col gap-3">
        {items.map((e, i) => (
          <div key={i} className="rounded-2xl border border-border/60 bg-surface-2/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {e.title && <span className="text-sm font-semibold text-ink">{e.title}</span>}
              {e.partner && <span className="chip">{e.partner}</span>}
            </div>
            {e.summary && <p className="mt-2 text-sm leading-relaxed text-muted">{e.summary}</p>}
          </div>
        ))}
      </div>
    );
  }
  const list = asStringArray(value);
  return list.length > 0 ? <BulletList items={list} /> : null;
}

/** Generic fallback for any unrecognised content key. */
function GenericSection({ k, value }: { k: string; value: unknown }) {
  const list = asStringArray(value);
  if (list.length > 0) {
    return (
      <SectionCard title={humanize(k)}>
        <BulletList items={list} dot="bg-brand" />
      </SectionCard>
    );
  }
  const text = asString(value);
  if (text) {
    return (
      <SectionCard title={humanize(k)}>
        <p className="text-sm leading-relaxed text-muted">{text}</p>
      </SectionCard>
    );
  }
  const records = asRecordArray(value);
  if (records.length > 0) {
    return (
      <SectionCard title={humanize(k)}>
        <div className="flex flex-col gap-3">
          {records.map((r, i) => {
            const title = pick(r, ["title", "name", "label", "key"]);
            const body = pick(r, ["summary", "description", "content", "value", "text"]);
            return (
              <div key={i} className="rounded-xl border border-border/60 bg-surface-2/40 p-3.5">
                {title && <span className="text-sm font-medium text-ink">{title}</span>}
                {body && <p className={title ? "mt-1 text-sm text-muted" : "text-sm text-muted"}>{body}</p>}
              </div>
            );
          })}
        </div>
      </SectionCard>
    );
  }
  if (isRecord(value)) {
    const rows = Object.entries(value).filter(([, v]) => asString(v) !== "" || asStringArray(v).length > 0);
    if (rows.length === 0) return null;
    return (
      <SectionCard title={humanize(k)}>
        <dl className="flex flex-col gap-2">
          {rows.map(([rk, rv]) => (
            <div key={rk} className="flex flex-col gap-0.5">
              <dt className="text-xs text-faint">{humanize(rk)}</dt>
              <dd className="text-sm text-muted">{asStringArray(rv).join("、") || asString(rv)}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>
    );
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return (
      <SectionCard title={humanize(k)}>
        <p className="text-sm text-muted">{String(value)}</p>
      </SectionCard>
    );
  }
  return null;
}

/**
 * Trip-level (`trip_summary`) report body. The hero summary is rendered by the
 * shared {@link ReportBody}; here we gracefully iterate the free-JSON content —
 * tailoring known keys (highlights / encounters / postcards) and falling back
 * to a defensive generic renderer for anything else.
 */
export function TripSummaryReport({ report }: { report: Report }) {
  const { t } = useTranslation("reports");
  const reduce = useReducedMotion() ?? false;
  const content = asRecord(report.content);

  const highlights = asStringArray(content.highlights);
  const reserved = new Set(["highlights", "encounters", "postcards", "summary"]);
  const rest = Object.entries(content).filter(([k, v]) => !reserved.has(k) && hasContent(v));

  const hasEncounters = hasContent(content.encounters);
  const hasPostcards = hasContent(content.postcards);
  const empty = highlights.length === 0 && !hasEncounters && !hasPostcards && rest.length === 0;

  if (empty) {
    return <p className="text-sm leading-relaxed text-muted">{t("tripSummary.empty")}</p>;
  }

  const sections: ReactNode[] = [];
  if (highlights.length > 0) {
    sections.push(
      <SectionCard key="highlights" title={t("tripSummary.highlights")}>
        <BulletList items={highlights} />
      </SectionCard>,
    );
  }
  if (hasEncounters) {
    sections.push(
      <SectionCard key="encounters" title={t("tripSummary.encounters")}>
        <Encounters value={content.encounters} />
      </SectionCard>,
    );
  }
  if (hasPostcards) {
    sections.push(
      <SectionCard key="postcards" title={t("tripSummary.postcards")}>
        <Postcards value={content.postcards} />
      </SectionCard>,
    );
  }
  for (const [k, v] of rest) {
    sections.push(<GenericSection key={k} k={k} value={v} />);
  }

  return (
    <motion.div
      variants={reduce ? undefined : staggerContainer(0.07)}
      initial={reduce ? undefined : "hidden"}
      animate={reduce ? undefined : "show"}
      className="flex flex-col gap-5"
    >
      {sections.map((section, i) => (
        <motion.div key={i} variants={reduce ? undefined : fadeUp}>
          {section}
        </motion.div>
      ))}
    </motion.div>
  );
}
