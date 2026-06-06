/**
 * The 捏脸 skill-selection step (plan §5, build half): a combined, searchable
 * multi-select over BOTH the caller's library/own skills (`useSkills`, Skill v2)
 * AND marketplace skill listings (`useMarketplace({ kind: "skill" })`).
 *
 * Selecting an entry collects its underlying skill id into `value` (a `skill_ids`
 * array the create flow ships to the backend). Library entries contribute their
 * own `skill.id`; marketplace entries contribute the listing's `ref_id` (the
 * skill it points at). Duplicates across the two sources are merged, preferring
 * the richer library record.
 */
import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import { skillBody } from "../../lib/api";
import { useMarketplace, useSkills } from "../../lib/queries";
import { fadeUp, spring, staggerContainer } from "../../lib/anim";
import { cn } from "../../lib/cn";
import { Badge } from "../../components/ui/Badge";
import { Input } from "../../components/ui/Input";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";

interface SkillOption {
  id: string;
  name: string;
  description: string;
  origin: "library" | "marketplace";
  tags: string[];
  body: string;
}

export interface SkillSelectorProps {
  /** Selected skill ids (`skill_ids`). */
  value: string[];
  onChange: (next: string[]) => void;
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function SkillSelector({ value, onChange }: SkillSelectorProps) {
  const { t } = useTranslation(["create", "common"]);
  const reduce = useReducedMotion() ?? false;
  const [query, setQuery] = useState("");

  const skills = useSkills({});
  const marketplace = useMarketplace({ kind: "skill" });
  const loading = skills.isLoading || marketplace.isLoading;

  const options = useMemo<SkillOption[]>(() => {
    const byId = new Map<string, SkillOption>();
    for (const s of skills.data?.items ?? []) {
      if (!byId.has(s.id)) {
        byId.set(s.id, {
          id: s.id,
          name: s.name,
          description: s.description ?? "",
          origin: "library",
          tags: s.tags ?? [],
          body: skillBody(s),
        });
      }
    }
    for (const item of marketplace.data?.items ?? []) {
      if (item.kind !== "skill") continue;
      if (!byId.has(item.ref_id)) {
        byId.set(item.ref_id, {
          id: item.ref_id,
          name: item.title,
          description: item.description ?? "",
          origin: "marketplace",
          tags: [],
          body: "",
        });
      }
    }
    return [...byId.values()];
  }, [skills.data, marketplace.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      `${o.name} ${o.description} ${o.tags.join(" ")}`.toLowerCase().includes(q),
    );
  }, [options, query]);

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("skillSelect.searchPlaceholder")}
            leftIcon={<SearchIcon />}
            aria-label={t("skillSelect.searchPlaceholder")}
          />
        </div>
        {value.length > 0 && (
          <div className="flex items-center gap-2">
            <Badge tone="brand">{t("skillSelect.selectedCount", { count: value.length })}</Badge>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs text-faint transition-colors hover:text-ink"
            >
              {t("common:actions.cancel")}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[4.5rem] w-full rounded-xl" />
          ))}
        </div>
      ) : options.length === 0 ? (
        <EmptyState icon={<span>🧩</span>} title={t("skillSelect.empty")} />
      ) : filtered.length === 0 ? (
        <p className="rounded-xl bg-surface-2/40 px-4 py-6 text-center text-sm text-faint ring-1 ring-border/40">
          {t("skillSelect.noMatch")}
        </p>
      ) : (
        <motion.ul
          className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1"
          variants={staggerContainer(0.03)}
          initial={reduce ? false : "hidden"}
          animate="show"
        >
          {filtered.map((opt) => {
            const selected = value.includes(opt.id);
            return (
              <motion.li key={opt.id} variants={reduce ? undefined : fadeUp} transition={spring.soft}>
                <button
                  type="button"
                  onClick={() => toggle(opt.id)}
                  aria-pressed={selected}
                  title={opt.body || opt.description || undefined}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl p-3.5 text-left ring-1 transition-colors",
                    selected
                      ? "bg-brand-soft ring-brand/50"
                      : "bg-surface-2/40 ring-border/40 hover:bg-surface-2/70 hover:ring-border",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md text-[11px] ring-1 transition-colors",
                      selected
                        ? "bg-brand text-white ring-brand"
                        : "bg-surface text-transparent ring-border/70",
                    )}
                    aria-hidden
                  >
                    ✓
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink">{opt.name}</span>
                      <Badge tone={opt.origin === "library" ? "neutral" : "accent"} className="shrink-0">
                        {t(`skillSelect.origin.${opt.origin}`)}
                      </Badge>
                    </span>
                    {opt.description && (
                      <span className="line-clamp-2 text-xs leading-relaxed text-muted">
                        {opt.description}
                      </span>
                    )}
                    {opt.tags.length > 0 && (
                      <span className="flex flex-wrap gap-1 pt-0.5">
                        {opt.tags.slice(0, 4).map((tag) => (
                          <span key={tag} className="chip bg-surface-2/70 text-faint">
                            {tag}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </button>
              </motion.li>
            );
          })}
        </motion.ul>
      )}
    </div>
  );
}
