/**
 * Standalone Social + Work sandbox workspace (plan §10). A monospace code editor
 * on the left runs against {@link useRunSandbox} and surfaces the result on the
 * right as a first-class evidence card — reusing the spectate view's
 * {@link SandboxBubble} so a "code ran" moment looks identical everywhere.
 *
 * The public run endpoint isn't in the locked API contract yet; the hook falls
 * back to a typed mock (echoing `print("…")` literals), so this page is fully
 * demoable today and swaps to real execution at integration.
 */
import { useCallback, useMemo, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Select } from "../../components/ui/Select";
import type { SelectOption } from "../../components/ui/Select";
import { Spinner } from "../../components/ui/Spinner";
import { Textarea } from "../../components/ui/Textarea";
import { SandboxBubble } from "../conversation/SandboxBubble";
import { fadeUp, staggerContainer } from "../../lib/anim";
import { cn } from "../../lib/cn";
import { formatTime } from "../../lib/format";
import { useDemoMode, useRunSandbox } from "../../lib/queries";
import type { SandboxRunResult } from "../../lib/api";
import { SANDBOX_EXAMPLES } from "./examples";
import type { SandboxExample } from "./examples";

const TIMEOUT_SECONDS = 10;
const MAX_HISTORY = 8;

interface RunRecord {
  id: string;
  language: string;
  result: SandboxRunResult;
  at: string;
}

export function SandboxPage() {
  const { t } = useTranslation(["sandbox", "common"]);
  const demo = useDemoMode();
  const reduce = useReducedMotion() ?? false;
  const run = useRunSandbox();

  const [code, setCode] = useState<string>(SANDBOX_EXAMPLES[0]?.code ?? "");
  const [language, setLanguage] = useState<string>("python");
  const [history, setHistory] = useState<RunRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => history.find((r) => r.id === selectedId) ?? history[0] ?? null,
    [history, selectedId],
  );

  const languageOptions: SelectOption[] = [
    { value: "python", label: t("editor.lang.python") },
    {
      value: "javascript",
      label: `${t("editor.lang.javascript")} · ${t("editor.comingSoon")}`,
      disabled: true,
    },
    { value: "sql", label: `${t("editor.lang.sql")} · ${t("editor.comingSoon")}`, disabled: true },
  ];

  const loadExample = useCallback((ex: SandboxExample) => {
    setCode(ex.code);
    setLanguage(ex.language);
  }, []);

  const handleRun = useCallback(async () => {
    if (!code.trim() || run.isPending) return;
    setError(null);
    try {
      const result = await run.mutateAsync({ code, language, timeout_seconds: TIMEOUT_SECONDS });
      const record: RunRecord = {
        id: crypto.randomUUID(),
        language: result.language,
        result,
        at: new Date().toISOString(),
      };
      setHistory((prev) => [record, ...prev].slice(0, MAX_HISTORY));
      setSelectedId(record.id);
    } catch {
      setError(t("output.error"));
    }
  }, [code, language, run, t]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <PageHeader
        eyebrow={t("page.eyebrow")}
        title={t("page.title")}
        description={t("page.description")}
        actions={demo ? <Badge tone="warning">{t("common:demo.badge")}</Badge> : undefined}
      />

      <motion.div
        variants={reduce ? undefined : staggerContainer(0.08)}
        initial={reduce ? false : "hidden"}
        animate="show"
        className="grid gap-6 lg:grid-cols-2 lg:items-start"
      >
        {/* Editor */}
        <motion.div variants={reduce ? undefined : fadeUp}>
          <Card glass className="flex flex-col">
            <CardHeader>
              <CardTitle>{t("editor.title")}</CardTitle>
              <p className="text-sm text-muted">{t("editor.subtitle")}</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="sm:w-44">
                  <Select
                    label={t("editor.languageLabel")}
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    options={languageOptions}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium tracking-wide text-muted">
                    {t("editor.examplesLabel")}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {SANDBOX_EXAMPLES.map((ex) => (
                      <Button
                        key={ex.id}
                        variant="secondary"
                        size="sm"
                        onClick={() => loadExample(ex)}
                        leftIcon={<span aria-hidden>{ex.icon}</span>}
                      >
                        {t(`examples.${ex.id}`)}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <Textarea
                label={t("editor.codeLabel")}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                rows={14}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                placeholder={t("editor.placeholder")}
                className="resize-none font-mono text-[13px] leading-relaxed"
              />

              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <p
                  className="flex max-w-md items-start gap-1.5 text-xs leading-relaxed text-faint"
                  title={t("hint.integration")}
                >
                  <InfoIcon className="mt-0.5 shrink-0" aria-hidden />
                  <span>{t("hint.integration")}</span>
                </p>
                <Button
                  onClick={handleRun}
                  loading={run.isPending}
                  disabled={!code.trim()}
                  leftIcon={<PlayIcon aria-hidden />}
                  className="shrink-0 self-start"
                >
                  {run.isPending ? t("editor.running") : t("editor.run")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Output + history */}
        <motion.div variants={reduce ? undefined : fadeUp} className="flex flex-col gap-6">
          <Card glass className="flex flex-col">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{t("output.title")}</CardTitle>
              {selected && !run.isPending && (
                <span className="font-mono text-xs text-faint">
                  {t("output.ranAt", { time: formatTime(selected.at) })}
                </span>
              )}
            </CardHeader>
            <CardContent className="flex min-h-[18rem] flex-col gap-3">
              {run.isPending ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted">
                  <Spinner size={22} className="text-brand" />
                  <span>{t("output.running")}</span>
                </div>
              ) : error ? (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
                >
                  <WarningIcon aria-hidden />
                  <span>{error}</span>
                </div>
              ) : selected ? (
                <>
                  {selected.result.timed_out && (
                    <div
                      role="alert"
                      className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
                    >
                      <WarningIcon aria-hidden />
                      <span>{t("output.timedOut")}</span>
                    </div>
                  )}
                  <SandboxBubble
                    side="left"
                    language={selected.result.language}
                    stdout={selected.result.stdout}
                    stderr={selected.result.stderr}
                    exitCode={selected.result.exit_code}
                    durationMs={selected.result.duration_ms}
                  />
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center">
                  <EmptyState
                    icon="🧪"
                    title={t("output.emptyTitle")}
                    description={t("output.emptyDescription")}
                    className="w-full border-0 py-6"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {history.length > 0 && (
            <Card glass>
              <CardHeader className="flex-row items-center justify-between pb-0">
                <CardTitle className="text-sm">{t("history.title")}</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setHistory([]);
                    setSelectedId(null);
                  }}
                >
                  {t("history.clear")}
                </Button>
              </CardHeader>
              <CardContent className="pt-3">
                <ul className="flex flex-col gap-1.5">
                  {history.map((r) => {
                    const active = r.id === selected?.id;
                    const failed = r.result.exit_code !== 0 || r.result.timed_out;
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(r.id)}
                          aria-pressed={active}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-xs transition-colors",
                            active
                              ? "border-brand/50 bg-brand-soft/50"
                              : "border-border/60 bg-surface-2/40 hover:border-border hover:bg-surface-2/70",
                          )}
                        >
                          <span
                            className={cn(
                              "h-2 w-2 shrink-0 rounded-full",
                              failed ? "bg-danger" : "bg-success",
                            )}
                            aria-hidden
                          />
                          <span className="font-mono text-faint">{formatTime(r.at)}</span>
                          <span className="text-muted">
                            {t(`editor.lang.${r.language}`, { defaultValue: r.language })}
                          </span>
                          <span className="ml-auto font-mono text-faint">
                            {r.result.duration_ms}ms · {t("exit", { code: r.result.exit_code })}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Icons — inline so the page carries no extra asset deps.                     */
/* -------------------------------------------------------------------------- */

type IconProps = ComponentType<SVGProps<SVGSVGElement>>;

const PlayIcon: IconProps = (props) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" {...props}>
    <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" />
  </svg>
);

const InfoIcon: IconProps = (props) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" {...props}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
    <path d="M12 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="7.75" r="1.1" fill="currentColor" />
  </svg>
);

const WarningIcon: IconProps = (props) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" {...props}>
    <path
      d="M12 3.5 21 19H3l9-15.5Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path d="M12 9.5v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="16.5" r="1" fill="currentColor" />
  </svg>
);
