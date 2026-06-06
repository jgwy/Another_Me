/**
 * Small, controlled field primitives shared across the create-agent wizard.
 * Each animates only transform/opacity to hold the 60fps target.
 */
import { useState } from "react";
import type { KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "../../lib/cn";
import { spring, staggerContainer, fadeUp } from "../../lib/anim";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { EMOJI_SET } from "./questionnaire";

/* -------------------------------------------------------------------------- */
/* Progress rail                                                               */
/* -------------------------------------------------------------------------- */

export interface WizardProgressStep {
  id: string;
  short: string;
}

export function WizardProgress({
  steps,
  current,
  maxReached,
  onJump,
}: {
  steps: WizardProgressStep[];
  current: number;
  maxReached: number;
  onJump: (index: number) => void;
}) {
  const progress = steps.length > 1 ? (current + 1) / steps.length : 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className="h-full w-full rounded-full bg-gradient-to-r from-brand to-accent"
          style={{ transformOrigin: "left" }}
          initial={false}
          animate={{ scaleX: progress }}
          transition={spring.soft}
        />
      </div>

      <ol className="flex items-center gap-1.5 overflow-x-auto">
        {steps.map((step, i) => {
          const active = i === current;
          const done = i < current;
          const reachable = i <= maxReached;
          return (
            <li key={step.id} className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onJump(i)}
                className={cn(
                  "flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  reachable ? "cursor-pointer" : "cursor-default",
                  active
                    ? "bg-brand-soft text-brand ring-1 ring-brand/40"
                    : done
                      ? "text-accent hover:text-accent"
                      : "text-faint",
                )}
              >
                <span
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px]",
                    active
                      ? "bg-brand text-white"
                      : done
                        ? "bg-accent/15 text-accent ring-1 ring-accent/40"
                        : "bg-surface-2 text-faint ring-1 ring-border/50",
                  )}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className="hidden whitespace-nowrap sm:inline">{step.short}</span>
              </button>
              {i < steps.length - 1 && (
                <span aria-hidden className="hidden h-px w-4 shrink-0 bg-border/60 sm:block" />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Field label                                                                 */
/* -------------------------------------------------------------------------- */

export function FieldLabel({ children, hint }: { children: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium tracking-wide text-muted">{children}</span>
      {hint && <span className="text-xs text-faint">{hint}</span>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Emoji / avatar picker                                                       */
/* -------------------------------------------------------------------------- */

export function EmojiPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <motion.div
        variants={staggerContainer(0.015)}
        initial="hidden"
        animate="show"
        className="flex flex-wrap gap-2"
      >
        {EMOJI_SET.map((emoji) => {
          const selected = value === emoji;
          return (
            <motion.button
              key={emoji}
              type="button"
              variants={fadeUp}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.92 }}
              transition={spring.snappy}
              onClick={() => onChange(emoji)}
              className={cn(
                "grid h-11 w-11 place-items-center rounded-xl text-xl transition-colors",
                selected
                  ? "bg-brand-soft ring-1 ring-brand/50"
                  : "bg-surface-2/60 ring-1 ring-border/50 hover:bg-surface-2",
              )}
              aria-pressed={selected}
              aria-label={`Use ${emoji}`}
            >
              {emoji}
            </motion.button>
          );
        })}
      </motion.div>
      <Input
        label="Or paste an emoji / image URL"
        placeholder="e.g. 🌟 or https://…/avatar.png"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Suggestion chips (single-pick into a free-text field)                       */
/* -------------------------------------------------------------------------- */

export function SuggestChips({
  options,
  value,
  onPick,
}: {
  options: string[];
  value: string;
  onPick: (option: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = value.trim().toLowerCase() === option.toLowerCase();
        return (
          <motion.button
            key={option}
            type="button"
            whileTap={{ scale: 0.94 }}
            transition={spring.snappy}
            onClick={() => onPick(option)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-brand text-white"
                : "bg-surface-2/70 text-muted ring-1 ring-border/50 hover:text-ink",
            )}
          >
            {option}
          </motion.button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Multi-select chips (with optional custom add)                               */
/* -------------------------------------------------------------------------- */

export function MultiChips({
  options,
  value,
  onChange,
  allowCustom = false,
  customPlaceholder = "Add your own…",
}: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  allowCustom?: boolean;
  customPlaceholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const toggle = (option: string) => {
    onChange(
      value.includes(option) ? value.filter((v) => v !== option) : [...value, option],
    );
  };

  const addCustom = () => {
    const v = draft.trim();
    if (!v) return;
    if (!value.some((existing) => existing.toLowerCase() === v.toLowerCase())) {
      onChange([...value, v]);
    }
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCustom();
    }
  };

  const extras = value.filter((v) => !options.includes(v));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = value.includes(option);
          return (
            <motion.button
              key={option}
              type="button"
              whileTap={{ scale: 0.94 }}
              transition={spring.snappy}
              onClick={() => toggle(option)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                active
                  ? "bg-brand text-white"
                  : "bg-surface-2/70 text-muted ring-1 ring-border/50 hover:text-ink",
              )}
              aria-pressed={active}
            >
              {option}
            </motion.button>
          );
        })}
        <AnimatePresence mode="popLayout">
          {extras.map((extra) => (
            <motion.button
              key={extra}
              layout
              type="button"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={spring.snappy}
              onClick={() => toggle(extra)}
              className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-xs font-medium text-white"
            >
              {extra}
              <span aria-hidden className="text-white/70">×</span>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>

      {allowCustom && (
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={customPlaceholder}
            />
          </div>
          <Button type="button" variant="secondary" onClick={addCustom} disabled={!draft.trim()}>
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* List editor (add / remove rows) — for dos & don'ts                          */
/* -------------------------------------------------------------------------- */

export function ListEditor({
  value,
  onChange,
  placeholder,
  tone = "accent",
  emptyHint,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  tone?: "accent" | "danger";
  emptyHint?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...value, v]);
    setDraft("");
  };

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  const dot = tone === "danger" ? "bg-danger" : "bg-accent";

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
          />
        </div>
        <Button type="button" variant="secondary" onClick={add} disabled={!draft.trim()}>
          Add
        </Button>
      </div>

      {value.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {value.map((item, i) => (
              <motion.li
                key={`${i}-${item}`}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={spring.snappy}
                className="group flex items-center gap-2.5 rounded-xl bg-surface-2/50 px-3 py-2 text-sm text-ink ring-1 ring-border/40"
              >
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
                <span className="min-w-0 flex-1 break-words">{item}</span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="shrink-0 rounded-md px-1.5 text-faint transition-colors hover:text-danger"
                  aria-label={`Remove “${item}”`}
                >
                  ×
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : (
        emptyHint && <p className="text-xs text-faint">{emptyHint}</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Toggle switch                                                               */
/* -------------------------------------------------------------------------- */

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl bg-surface-2/40 px-4 py-3 text-left ring-1 ring-border/40 transition-colors hover:ring-border"
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-ink">{label}</span>
        {description && <span className="text-xs text-faint">{description}</span>}
      </span>
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand" : "bg-surface-2 ring-1 ring-border/60",
        )}
      >
        <motion.span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm"
          animate={{ x: checked ? 22 : 2 }}
          transition={spring.snappy}
        />
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Range field                                                                 */
/* -------------------------------------------------------------------------- */

export function RangeField({
  value,
  min,
  max,
  onChange,
  label,
  hint,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between">
        <FieldLabel hint={hint}>{label}</FieldLabel>
        <span className="font-mono text-lg font-semibold text-ink">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-brand"
        aria-label={label}
      />
      <div className="flex justify-between text-[10px] uppercase tracking-wide text-faint">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
