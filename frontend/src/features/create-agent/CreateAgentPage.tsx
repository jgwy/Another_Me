/**
 * The "捏脸" (build-a-twin) wizard — a multi-step questionnaire that collects an
 * identity, persona, voice, social parameters, and custom skills, then maps them
 * into an `AgentCreate` and ships it via `useCreateAgent` (R1, R2).
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import type { Variants } from "motion/react";

import { spring } from "../../lib/anim";
import { useCreateAgent } from "../../lib/queries";
import { PageHeader } from "../../components/layout/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Textarea } from "../../components/ui/Textarea";
import { Badge } from "../../components/ui/Badge";
import { Avatar } from "../../components/ui/Avatar";

import {
  DOMAIN_SUGGESTIONS,
  INITIAL_FORM,
  PERSONALITY_OPTIONS,
  STEPS,
  TONE_SUGGESTIONS,
  buildAgentCreate,
  splitList,
  validateStep,
} from "./questionnaire";
import type { WizardForm } from "./questionnaire";
import {
  EmojiPicker,
  FieldLabel,
  ListEditor,
  MultiChips,
  RangeField,
  SuggestChips,
  Toggle,
  WizardProgress,
} from "./fields";
import { SkillUploader } from "./SkillUploader";

const stepVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 36 : -36 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -36 : 36 }),
};

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <FieldLabel hint={hint}>{title}</FieldLabel>
      {children}
    </div>
  );
}

function ReviewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-border/40 py-3 last:border-0 sm:flex-row sm:items-start sm:gap-4">
      <span className="w-32 shrink-0 text-xs font-medium uppercase tracking-wide text-faint">
        {label}
      </span>
      <div className="min-w-0 flex-1 text-sm text-ink">{children}</div>
    </div>
  );
}

export function CreateAgentPage() {
  const navigate = useNavigate();
  const createAgent = useCreateAgent();

  const [form, setForm] = useState<WizardForm>(INITIAL_FORM);
  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [direction, setDirection] = useState(1);
  const [stepError, setStepError] = useState<string | null>(null);

  const update = (patch: Partial<WizardForm>) => setForm((f) => ({ ...f, ...patch }));

  const isLast = step === STEPS.length - 1;

  const goTo = (index: number) => {
    if (index > maxReached) return;
    setDirection(index > step ? 1 : -1);
    setStep(index);
    setStepError(null);
  };

  const next = () => {
    const err = validateStep(step, form);
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    setDirection(1);
    const target = Math.min(step + 1, STEPS.length - 1);
    setStep(target);
    setMaxReached((m) => Math.max(m, target));
  };

  const back = () => {
    setStepError(null);
    setDirection(-1);
    setStep((s) => Math.max(0, s - 1));
  };

  const submit = async () => {
    for (let i = 0; i < STEPS.length; i++) {
      const err = validateStep(i, form);
      if (err) {
        setDirection(i < step ? -1 : 1);
        setStep(i);
        setStepError(err);
        return;
      }
    }
    setStepError(null);
    try {
      const created = await createAgent.mutateAsync(buildAgentCreate(form));
      navigate(`/agents/${created.id}`);
    } catch {
      /* surfaced via createAgent.isError banner below */
    }
  };

  const interestsPreview = splitList(form.interests);
  const createError = createAgent.isError
    ? createAgent.error?.message || "Could not create your twin. Please try again."
    : null;

  const renderStep = () => {
    const id = STEPS[step]?.id;
    switch (id) {
      case "identity":
        return (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-4 rounded-2xl bg-surface-2/40 p-4 ring-1 ring-border/40">
              <Avatar name={form.name || "Your twin"} avatar={form.avatar || null} size="lg" />
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-ink">
                  {form.name.trim() || "Your twin"}
                </span>
                <span className="text-xs text-faint">Live preview</span>
              </div>
            </div>
            <Input
              label="Name"
              placeholder="e.g. Kai Rivera"
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
              autoFocus
            />
            <Section title="Avatar" hint="Pick a face — or paste your own emoji or image URL.">
              <EmojiPicker value={form.avatar} onChange={(avatar) => update({ avatar })} />
            </Section>
          </div>
        );

      case "domain":
        return (
          <div className="flex flex-col gap-6">
            <Section title="Domain" hint="The field your twin knows best.">
              <Input
                placeholder="e.g. fintech, education, data…"
                value={form.domain}
                onChange={(e) => update({ domain: e.target.value })}
              />
              <SuggestChips
                options={DOMAIN_SUGGESTIONS}
                value={form.domain}
                onPick={(domain) => update({ domain })}
              />
            </Section>
            <Section title="Personality" hint="Pick the traits that fit — add your own too.">
              <MultiChips
                options={PERSONALITY_OPTIONS}
                value={form.personality}
                onChange={(personality) => update({ personality })}
                allowCustom
                customPlaceholder="Add a trait…"
              />
            </Section>
            <Section title="Interests" hint="Comma-separated. These sharpen profile matching.">
              <Input
                placeholder="e.g. growth, retention, climbing, jazz"
                value={form.interests}
                onChange={(e) => update({ interests: e.target.value })}
              />
            </Section>
          </div>
        );

      case "voice":
        return (
          <div className="flex flex-col gap-6">
            <Section title="Tone" hint="How your twin sounds in a room.">
              <Input
                placeholder="e.g. energetic & candid"
                value={form.tone}
                onChange={(e) => update({ tone: e.target.value })}
              />
              <SuggestChips
                options={TONE_SUGGESTIONS}
                value={form.tone}
                onPick={(tone) => update({ tone })}
              />
            </Section>
            <Section title="Always do" hint="Habits your twin leans on.">
              <ListEditor
                value={form.dos}
                onChange={(dos) => update({ dos })}
                placeholder="e.g. back claims with data"
                tone="accent"
                emptyHint="No do's yet — add one above."
              />
            </Section>
            <Section title="Never do" hint="Lines your twin won't cross.">
              <ListEditor
                value={form.donts}
                onChange={(donts) => update({ donts })}
                placeholder="e.g. dodge hard questions"
                tone="danger"
                emptyHint="No don'ts yet — add one above."
              />
            </Section>
          </div>
        );

      case "social":
        return (
          <div className="flex flex-col gap-6">
            <RangeField
              label="Max rounds"
              hint="How many turns your twin will go in a single scene."
              value={form.maxRounds}
              min={2}
              max={16}
              onChange={(maxRounds) => update({ maxRounds })}
            />
            <Toggle
              checked={form.isPublic}
              onChange={(isPublic) => update({ isPublic })}
              label="Make this twin public"
              description="Public twins can be discovered and dispatched by anyone on the island."
            />
            <Section title="Goals" hint="What is your twin trying to achieve out there?">
              <Textarea
                rows={4}
                placeholder="e.g. Practice defending unit economics under tough investor questions."
                value={form.goals}
                onChange={(e) => update({ goals: e.target.value })}
              />
            </Section>
          </div>
        );

      case "skills":
        return <SkillUploader skills={form.skills} onChange={(skills) => update({ skills })} />;

      case "review":
        return (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <Avatar name={form.name || "Your twin"} avatar={form.avatar || null} size="xl" />
              <div className="flex flex-col gap-1">
                <span className="text-lg font-semibold tracking-tight text-ink">
                  {form.name.trim() || "Your twin"}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {form.domain.trim() && <Badge tone="brand">{form.domain.trim()}</Badge>}
                  <Badge tone={form.isPublic ? "accent" : "neutral"}>
                    {form.isPublic ? "Public" : "Private"}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-surface-2/30 px-4 ring-1 ring-border/40">
              <ReviewRow label="Personality">
                {form.personality.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {form.personality.map((p) => (
                      <Badge key={p} tone="neutral">
                        {p}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-faint">—</span>
                )}
              </ReviewRow>
              <ReviewRow label="Interests">
                {interestsPreview.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {interestsPreview.map((p) => (
                      <Badge key={p} tone="neutral">
                        {p}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-faint">—</span>
                )}
              </ReviewRow>
              <ReviewRow label="Tone">
                {form.tone.trim() || <span className="text-faint">auto</span>}
              </ReviewRow>
              <ReviewRow label="Always">
                {form.dos.length ? form.dos.join(" · ") : <span className="text-faint">—</span>}
              </ReviewRow>
              <ReviewRow label="Never">
                {form.donts.length ? form.donts.join(" · ") : <span className="text-faint">—</span>}
              </ReviewRow>
              <ReviewRow label="Max rounds">{form.maxRounds}</ReviewRow>
              <ReviewRow label="Skills">
                {form.skills.filter((s) => s.name.trim() && s.content.trim()).length || 0} attached
              </ReviewRow>
              {form.goals.trim() && <ReviewRow label="Goals">{form.goals.trim()}</ReviewRow>}
            </div>

            <Section title="Persona (optional)" hint="Leave blank to auto-generate from the answers above.">
              <Textarea
                rows={3}
                placeholder="Write a sentence or two in your twin's voice…"
                value={form.persona}
                onChange={(e) => update({ persona: e.target.value })}
              />
            </Section>
          </div>
        );

      default:
        return null;
    }
  };

  const current = STEPS[step]!;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Create"
        title="Build a twin"
        description="Answer a few prompts and we'll shape an AI twin that thinks, argues, and grows like you."
        backTo="/agents"
        backLabel="All agents"
      />

      <Card glow className="overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-brand/15 blur-[100px]"
        />
        <div className="relative flex flex-col gap-7 p-6 sm:p-8">
          <WizardProgress
            steps={STEPS}
            current={step}
            maxReached={maxReached}
            onJump={goTo}
          />

          <div className="min-h-[22rem]">
            <AnimatePresence mode="wait" custom={direction} initial={false}>
              <motion.div
                key={current.id}
                custom={direction}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={spring.soft}
                className="flex flex-col gap-5"
              >
                <div className="flex flex-col gap-1">
                  <h2 className="text-xl font-semibold tracking-tight text-ink">{current.title}</h2>
                  <p className="text-sm text-muted">{current.description}</p>
                </div>
                {renderStep()}
              </motion.div>
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {(stepError || createError) && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={spring.snappy}
                className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
              >
                {stepError ?? createError}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-5">
            <Button
              type="button"
              variant="ghost"
              onClick={back}
              disabled={step === 0 || createAgent.isPending}
            >
              Back
            </Button>

            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-faint sm:inline">
                Step {step + 1} of {STEPS.length}
              </span>
              {isLast ? (
                <Button
                  type="button"
                  size="lg"
                  onClick={submit}
                  loading={createAgent.isPending}
                  rightIcon={<span aria-hidden>→</span>}
                >
                  Create twin
                </Button>
              ) : (
                <Button type="button" size="lg" onClick={next} rightIcon={<span aria-hidden>→</span>}>
                  Continue
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
