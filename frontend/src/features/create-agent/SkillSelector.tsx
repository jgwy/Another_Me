/**
 * The 捏脸 skill-selection step (plan §5, build half): a combined, searchable
 * multi-select over BOTH the caller's library/own skills (`useSkills`, Skill v2)
 * AND marketplace skill listings (`useMarketplace({ kind: "skill" })`), plus two
 * import affordances:
 *
 * - **.zip import** → `POST /api/skills/import` (parses SKILL.md/manifest), and
 *   the new library skill is auto-selected.
 * - **MCP add** → `POST /api/mcps` + `/{id}/connect` to register a tool server
 *   and discover its tools (connected inside the sandbox).
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
import { useMarketplace, useMcps, useSkills } from "../../lib/queries";
import { fadeUp, spring, staggerContainer } from "../../lib/anim";
import { cn } from "../../lib/cn";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkillImportModal } from "./SkillImportModal";
import { McpConnectModal } from "./McpConnectModal";

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

function ZipIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 3v18M4 7.5l8 4.5 8-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function PlugIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 2v6M15 2v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M6 8h12v3a6 6 0 0 1-12 0V8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 17v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const MCP_STATUS_TONE = {
  online: "success",
  offline: "neutral",
  error: "danger",
  unknown: "neutral",
} as const;

export function SkillSelector({ value, onChange }: SkillSelectorProps) {
  const { t } = useTranslation(["create", "common"]);
  const reduce = useReducedMotion() ?? false;
  const [query, setQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);

  const skills = useSkills({});
  const marketplace = useMarketplace({ kind: "skill" });
  const mcps = useMcps({ owner: "me" });
  const loading = skills.isLoading || marketplace.isLoading;
  const mcpServers = mcps.data?.items ?? [];

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

  const select = (id: string) => {
    if (!value.includes(id)) onChange([...value, id]);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Import affordances: .zip pack + MCP server */}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="secondary" leftIcon={<ZipIcon />} onClick={() => setImportOpen(true)}>
          {t("skillSelect.importZip")}
        </Button>
        <Button type="button" size="sm" variant="secondary" leftIcon={<PlugIcon />} onClick={() => setMcpOpen(true)}>
          {t("skillSelect.addMcp")}
        </Button>
      </div>

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

      {/* Connected MCP tool servers (sandbox-connected) */}
      {mcpServers.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border/40 pt-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium tracking-wide text-muted">
              {t("skillSelect.mcpSectionTitle")}
            </span>
            <span className="text-xs text-faint">{t("skillSelect.mcpSectionHint")}</span>
          </div>
          <ul className="flex flex-col gap-2">
            {mcpServers.map((server) => {
              const tools = server.tools ?? [];
              return (
                <li
                  key={server.id}
                  className="flex flex-col gap-1.5 rounded-xl bg-surface-2/40 px-3.5 py-2.5 ring-1 ring-border/40"
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">{server.name}</span>
                    <Badge tone={MCP_STATUS_TONE[server.status]}>
                      {t(`mcp.statusLabel.${server.status}`)}
                    </Badge>
                    <span className="ml-auto shrink-0 text-xs text-faint">
                      {t("skillSelect.mcpToolsCount", { count: tools.length })}
                    </span>
                  </div>
                  {tools.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {tools.map((tool, i) => (
                        <span key={tool.name ?? i} className="chip bg-surface-2/70 font-mono text-faint">
                          {tool.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-faint">{t("skillSelect.mcpNoTools")}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <SkillImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(skill) => select(skill.id)}
      />
      <McpConnectModal open={mcpOpen} onClose={() => setMcpOpen(false)} />
    </div>
  );
}
