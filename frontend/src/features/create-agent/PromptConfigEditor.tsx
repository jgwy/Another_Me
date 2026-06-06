/**
 * Dual-mode editor for a structured {@link PromptConfig} (the social-twin brain).
 *
 * The canonical state lives in the parent as a `PromptConfig` object (`value`).
 * Two views edit it without ever fighting each other:
 *
 * - **Guided form** mutates the object directly via section setters; the JSON is
 *   only *derived* for display (we never type into a derived string).
 * - **Raw JSON** keeps its own local `jsonDraft` string so the textarea is never
 *   clobbered while the user types. On every keystroke we `JSON.parse`; only when
 *   it succeeds do we `normalizePromptConfig(...)` and commit to the parent. A
 *   parse failure surfaces a hint and leaves the canonical object untouched.
 *
 * Because the textarea is bound to `jsonDraft` (not to `value`), a successful
 * commit re-rendering the parent can't loop back and reset the caret. The draft
 * is (re)seeded from `value` only when the user *enters* JSON mode — and callers
 * that swap `value` wholesale (regenerate, opening the tune modal) should pass a
 * changing `key` to remount with a fresh seed.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { Formality, PromptConfig } from "../../lib/api";
import { normalizePromptConfig } from "../../lib/api";
import { Input } from "../../components/ui/Input";
import { Textarea } from "../../components/ui/Textarea";
import { Select } from "../../components/ui/Select";
import { Tabs } from "../../components/ui/Tabs";
import { cn } from "../../lib/cn";
import { FieldLabel, ListEditor, Toggle } from "./fields";

export interface PromptConfigEditorProps {
  value: PromptConfig;
  onChange: (next: PromptConfig) => void;
  /** Fallback name used when normalizing hand-edited JSON. */
  name?: string;
  className?: string;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-surface-2/30 p-4 ring-1 ring-border/40">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-faint">{title}</h4>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <FieldLabel hint={hint}>{label}</FieldLabel>
      {children}
    </div>
  );
}

export function PromptConfigEditor({ value, onChange, name = "", className }: PromptConfigEditorProps) {
  const { t } = useTranslation(["create", "common"]);
  const reduce = useReducedMotion() ?? false;

  const [view, setView] = useState<"form" | "json">("form");
  const [jsonDraft, setJsonDraft] = useState(() => JSON.stringify(value, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  /* Section setters — fully typed, immutable, no computed-key widening. */
  const setIdentity = (p: Partial<PromptConfig["identity"]>) =>
    onChange({ ...value, identity: { ...value.identity, ...p } });
  const setVoice = (p: Partial<PromptConfig["voice"]>) =>
    onChange({ ...value, voice: { ...value.voice, ...p } });
  const setValues = (p: Partial<PromptConfig["values"]>) =>
    onChange({ ...value, values: { ...value.values, ...p } });
  const setInterests = (p: Partial<PromptConfig["interests"]>) =>
    onChange({ ...value, interests: { ...value.interests, ...p } });
  const setMemory = (p: Partial<PromptConfig["memory_hooks"]>) =>
    onChange({ ...value, memory_hooks: { ...value.memory_hooks, ...p } });
  const setSecurity = (p: Partial<PromptConfig["security"]>) =>
    onChange({ ...value, security: { ...value.security, ...p } });

  const enterJson = () => {
    setJsonDraft(JSON.stringify(value, null, 2));
    setJsonError(null);
    setView("json");
  };

  const onJsonChange = (text: string) => {
    setJsonDraft(text);
    try {
      const parsed: unknown = JSON.parse(text);
      setJsonError(null);
      onChange(normalizePromptConfig(parsed, name));
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : String(err));
    }
  };

  const addPlaceholder = t("tune.addPlaceholder");
  const formalityOptions = (["casual", "neutral", "formal"] as Formality[]).map((f) => ({
    value: f,
    label: t(`tune.formality.${f}`),
  }));

  const form = (
    <div className="flex flex-col gap-4">
      <Group title={t("tune.sections.identity")}>
        <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
          <Input
            label={t("tune.fields.version")}
            value={value.version}
            onChange={(e) => onChange({ ...value, version: e.target.value })}
          />
          <Input
            label={t("tune.fields.name")}
            value={value.identity.name}
            onChange={(e) => setIdentity({ name: e.target.value })}
          />
        </div>
        <Input
          label={t("tune.fields.oneLiner")}
          value={value.identity.one_liner}
          onChange={(e) => setIdentity({ one_liner: e.target.value })}
        />
        <Textarea
          label={t("tune.fields.background")}
          rows={3}
          value={value.identity.background}
          onChange={(e) => setIdentity({ background: e.target.value })}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label={t("tune.fields.ageRange")}
            value={value.identity.age_range ?? ""}
            onChange={(e) => setIdentity({ age_range: e.target.value })}
          />
          <Input
            label={t("tune.fields.location")}
            value={value.identity.location ?? ""}
            onChange={(e) => setIdentity({ location: e.target.value })}
          />
          <Input
            label={t("tune.fields.pronouns")}
            value={value.identity.pronouns ?? ""}
            onChange={(e) => setIdentity({ pronouns: e.target.value })}
          />
        </div>
      </Group>

      <Group title={t("tune.sections.voice")}>
        <Input
          label={t("tune.fields.tone")}
          value={value.voice.tone}
          onChange={(e) => setVoice({ tone: e.target.value })}
        />
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Select
            label={t("tune.fields.formality")}
            options={formalityOptions}
            value={value.voice.formality}
            onChange={(e) => setVoice({ formality: e.target.value as Formality })}
          />
          <div className="sm:pt-1.5">
            <Toggle
              checked={value.voice.emoji}
              onChange={(emoji) => setVoice({ emoji })}
              label={t("tune.fields.emoji")}
              description={t("tune.fields.emojiDescription")}
            />
          </div>
        </div>
        <Field label={t("tune.fields.speakingStyle")}>
          <ListEditor
            value={value.voice.speaking_style}
            onChange={(speaking_style) => setVoice({ speaking_style })}
            placeholder={addPlaceholder}
          />
        </Field>
        <Field label={t("tune.fields.catchphrases")}>
          <ListEditor
            value={value.voice.catchphrases}
            onChange={(catchphrases) => setVoice({ catchphrases })}
            placeholder={addPlaceholder}
          />
        </Field>
      </Group>

      <Group title={t("tune.sections.values")}>
        <Field label={t("tune.fields.coreValues")}>
          <ListEditor
            value={value.values.core_values}
            onChange={(core_values) => setValues({ core_values })}
            placeholder={addPlaceholder}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("tune.fields.dos")}>
            <ListEditor
              value={value.values.dos}
              onChange={(dos) => setValues({ dos })}
              placeholder={addPlaceholder}
              tone="accent"
            />
          </Field>
          <Field label={t("tune.fields.donts")}>
            <ListEditor
              value={value.values.donts}
              onChange={(donts) => setValues({ donts })}
              placeholder={addPlaceholder}
              tone="danger"
            />
          </Field>
        </div>
        <Field label={t("tune.fields.boundaries")}>
          <ListEditor
            value={value.values.boundaries}
            onChange={(boundaries) => setValues({ boundaries })}
            placeholder={addPlaceholder}
            tone="danger"
          />
        </Field>
      </Group>

      <Group title={t("tune.sections.interests")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("tune.fields.passions")}>
            <ListEditor
              value={value.interests.passions}
              onChange={(passions) => setInterests({ passions })}
              placeholder={addPlaceholder}
            />
          </Field>
          <Field label={t("tune.fields.expertise")}>
            <ListEditor
              value={value.interests.expertise}
              onChange={(expertise) => setInterests({ expertise })}
              placeholder={addPlaceholder}
            />
          </Field>
          <Field label={t("tune.fields.curiosities")}>
            <ListEditor
              value={value.interests.curiosities}
              onChange={(curiosities) => setInterests({ curiosities })}
              placeholder={addPlaceholder}
            />
          </Field>
          <Field label={t("tune.fields.dislikes")}>
            <ListEditor
              value={value.interests.dislikes}
              onChange={(dislikes) => setInterests({ dislikes })}
              placeholder={addPlaceholder}
              tone="danger"
            />
          </Field>
        </div>
      </Group>

      <Group title={t("tune.sections.memory")}>
        <Field label={t("tune.fields.signatureStories")}>
          <ListEditor
            value={value.memory_hooks.signature_stories}
            onChange={(signature_stories) => setMemory({ signature_stories })}
            placeholder={addPlaceholder}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("tune.fields.relationships")}>
            <ListEditor
              value={value.memory_hooks.relationships}
              onChange={(relationships) => setMemory({ relationships })}
              placeholder={addPlaceholder}
            />
          </Field>
          <Field label={t("tune.fields.recentContext")}>
            <ListEditor
              value={value.memory_hooks.recent_context}
              onChange={(recent_context) => setMemory({ recent_context })}
              placeholder={addPlaceholder}
            />
          </Field>
        </div>
        <Field label={t("tune.fields.goals")}>
          <ListEditor
            value={value.memory_hooks.goals}
            onChange={(goals) => setMemory({ goals })}
            placeholder={addPlaceholder}
          />
        </Field>
      </Group>

      <Group title={t("tune.sections.security")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            checked={value.security.identity_integrity}
            onChange={(identity_integrity) => setSecurity({ identity_integrity })}
            label={t("tune.fields.identityIntegrity")}
          />
          <Toggle
            checked={value.security.instruction_protection}
            onChange={(instruction_protection) => setSecurity({ instruction_protection })}
            label={t("tune.fields.instructionProtection")}
          />
          <Toggle
            checked={value.security.injection_defense}
            onChange={(injection_defense) => setSecurity({ injection_defense })}
            label={t("tune.fields.injectionDefense")}
          />
          <Toggle
            checked={value.security.stay_in_character}
            onChange={(stay_in_character) => setSecurity({ stay_in_character })}
            label={t("tune.fields.stayInCharacter")}
          />
        </div>
        <Field label={t("tune.fields.forbiddenReveals")}>
          <ListEditor
            value={value.security.forbidden_reveals}
            onChange={(forbidden_reveals) => setSecurity({ forbidden_reveals })}
            placeholder={addPlaceholder}
            tone="danger"
          />
        </Field>
      </Group>
    </div>
  );

  const json = (
    <div className="flex flex-col gap-2">
      <Textarea
        value={jsonDraft}
        onChange={(e) => onJsonChange(e.target.value)}
        rows={22}
        spellCheck={false}
        aria-label={t("tune.modeJson")}
        className="font-mono text-xs leading-relaxed"
      />
      {jsonError ? (
        <p className="text-xs text-danger">{t("tune.jsonError", { message: jsonError })}</p>
      ) : (
        <p className="text-xs text-faint">{t("tune.jsonHint")}</p>
      )}
    </div>
  );

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <Tabs
        tabs={[
          { id: "form", label: t("tune.modeForm") },
          { id: "json", label: t("tune.modeJson") },
        ]}
        value={view}
        onChange={(id) => (id === "json" ? enterJson() : setView("form"))}
        layoutId="prompt-config-view"
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: reduce ? 0 : 0.16 }}
        >
          {view === "form" ? form : json}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
