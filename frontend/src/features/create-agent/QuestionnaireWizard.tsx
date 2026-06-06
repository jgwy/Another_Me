/**
 * The "问卷" (build-a-twin) wizard — a multi-step questionnaire that collects an
 * identity, persona, voice, social parameters, selected + uploaded skills, then
 * maps them into an `AgentCreate` and ships it via `useCreateAgent` (R1, R2).
 *
 * Behavior is the original wizard's, lifted out of `CreateAgentPage` so the page
 * can offer it alongside the generative entries. The only addition is the 捏脸
 * skill-selection step (plan §5): library/marketplace skill ids collected into
 * `skill_ids` and appended to the questionnaire-built request body.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import type { Variants } from "motion/react";
import { useTranslation } from "react-i18next";

import { spring } from "../../lib/anim";
import { useCreateAgent } from "../../lib/queries";
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
import { SkillSelector } from "./SkillSelector";

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

export function QuestionnaireWizard() {
  const navigate = useNavigate();
  const { t } = useTranslation(["create", "common"]);
  const createAgent = useCreateAgent();

  const [form, setForm] = useState<WizardForm>(INITIAL_FORM);
  const [skillIds, setSkillIds] = useState<string[]>([]);
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
      setStepError(t(err));
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
        setStepError(t(err));
        return;
      }
    }
    setStepError(null);
    try {
      const created = await createAgent.mutateAsync({ ...buildAgentCreate(form), skill_ids: skillIds });
      navigate(`/agents/${created.id}`);
    } catch {
      /* surfaced via createAgent.isError banner below */
    }
  };

  const interestsPreview = splitList(form.interests);
  const createError = createAgent.isError
    ? createAgent.error?.message || t("page.createError")
    : null;

  const renderStep = () => {
    const id = STEPS[step]?.id;
    switch (id) {
      case "identity":
        return (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-4 rounded-2xl bg-surface-2/40 p-4 ring-1 ring-border/40">
              <Avatar name={form.name || t("page.twinFallback")} avatar={form.avatar || null} size="lg" />
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-ink">
                  {form.name.trim() || t("page.twinFallback")}
                </span>
                <span className="text-xs text-faint">{t("page.livePreview")}</span>
              </div>
            </div>
            <Input
              label={t("fields.name")}
              placeholder={t("fields.namePlaceholder")}
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
              autoFocus
            />
            <Section title={t("fields.avatar")} hint={t("fields.avatarHint")}>
              <EmojiPicker value={form.avatar} onChange={(avatar) => update({ avatar })} />
            </Section>
          </div>
        );

      case "domain":
        return (
          <div className="flex flex-col gap-6">
            <Section title={t("fields.domain")} hint={t("fields.domainHint")}>
              <Input
                placeholder={t("fields.domainPlaceholder")}
                value={form.domain}
                onChange={(e) => update({ domain: e.target.value })}
              />
              <SuggestChips
                options={DOMAIN_SUGGESTIONS}
                value={form.domain}
                onPick={(domain) => update({ domain })}
              />
            </Section>
            <Section title={t("fields.personality")} hint={t("fields.personalityHint")}>
              <MultiChips
                options={PERSONALITY_OPTIONS}
                value={form.personality}
                onChange={(personality) => update({ personality })}
                allowCustom
                customPlaceholder={t("fields.addTrait")}
              />
            </Section>
            <Section title={t("fields.interests")} hint={t("fields.interestsHint")}>
              <Input
                placeholder={t("fields.interestsPlaceholder")}
                value={form.interests}
                onChange={(e) => update({ interests: e.target.value })}
              />
            </Section>
          </div>
        );

      case "voice":
        return (
          <div className="flex flex-col gap-6">
            <Section title={t("fields.tone")} hint={t("fields.toneHint")}>
              <Input
                placeholder={t("fields.tonePlaceholder")}
                value={form.tone}
                onChange={(e) => update({ tone: e.target.value })}
              />
              <SuggestChips
                options={TONE_SUGGESTIONS}
                value={form.tone}
                onPick={(tone) => update({ tone })}
              />
            </Section>
            <Section title={t("fields.alwaysDo")} hint={t("fields.alwaysDoHint")}>
              <ListEditor
                value={form.dos}
                onChange={(dos) => update({ dos })}
                placeholder={t("fields.alwaysDoPlaceholder")}
                tone="accent"
                emptyHint={t("fields.alwaysDoEmpty")}
              />
            </Section>
            <Section title={t("fields.neverDo")} hint={t("fields.neverDoHint")}>
              <ListEditor
                value={form.donts}
                onChange={(donts) => update({ donts })}
                placeholder={t("fields.neverDoPlaceholder")}
                tone="danger"
                emptyHint={t("fields.neverDoEmpty")}
              />
            </Section>
          </div>
        );

      case "social":
        return (
          <div className="flex flex-col gap-6">
            <RangeField
              label={t("fields.maxRounds")}
              hint={t("fields.maxRoundsHint")}
              value={form.maxRounds}
              min={2}
              max={16}
              onChange={(maxRounds) => update({ maxRounds })}
            />
            <Toggle
              checked={form.isPublic}
              onChange={(isPublic) => update({ isPublic })}
              label={t("fields.makePublic")}
              description={t("fields.makePublicDescription")}
            />
            <Section title={t("fields.goals")} hint={t("fields.goalsHint")}>
              <Textarea
                rows={4}
                placeholder={t("fields.goalsPlaceholder")}
                value={form.goals}
                onChange={(e) => update({ goals: e.target.value })}
              />
            </Section>
          </div>
        );

      case "skills":
        return (
          <div className="flex flex-col gap-7">
            <Section title={t("skillSelect.selectTitle")} hint={t("skillSelect.hint")}>
              <SkillSelector value={skillIds} onChange={setSkillIds} />
            </Section>
            <Section title={t("skillSelect.uploadTitle")} hint={t("skillSelect.uploadHint")}>
              <SkillUploader skills={form.skills} onChange={(skills) => update({ skills })} />
            </Section>
          </div>
        );

      case "review":
        return (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <Avatar name={form.name || t("page.twinFallback")} avatar={form.avatar || null} size="xl" />
              <div className="flex flex-col gap-1">
                <span className="text-lg font-semibold tracking-tight text-ink">
                  {form.name.trim() || t("page.twinFallback")}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {form.domain.trim() && <Badge tone="brand">{form.domain.trim()}</Badge>}
                  <Badge tone={form.isPublic ? "accent" : "neutral"}>
                    {form.isPublic ? t("common:visibility.public") : t("common:visibility.private")}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-surface-2/30 px-4 ring-1 ring-border/40">
              <ReviewRow label={t("review.personality")}>
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
              <ReviewRow label={t("review.interests")}>
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
              <ReviewRow label={t("review.tone")}>
                {form.tone.trim() || <span className="text-faint">{t("review.toneAuto")}</span>}
              </ReviewRow>
              <ReviewRow label={t("review.always")}>
                {form.dos.length ? form.dos.join(" · ") : <span className="text-faint">—</span>}
              </ReviewRow>
              <ReviewRow label={t("review.never")}>
                {form.donts.length ? form.donts.join(" · ") : <span className="text-faint">—</span>}
              </ReviewRow>
              <ReviewRow label={t("review.maxRounds")}>{form.maxRounds}</ReviewRow>
              <ReviewRow label={t("review.skills")}>
                {t("review.skillsAttached", {
                  count: form.skills.filter((s) => s.name.trim() && s.content.trim()).length || 0,
                })}
                {skillIds.length > 0 && (
                  <>
                    {" · "}
                    {t("review.skillsSelected", { count: skillIds.length })}
                  </>
                )}
              </ReviewRow>
              {form.goals.trim() && <ReviewRow label={t("review.goals")}>{form.goals.trim()}</ReviewRow>}
            </div>

            <Section title={t("review.persona")} hint={t("review.personaHint")}>
              <Textarea
                rows={3}
                placeholder={t("review.personaPlaceholder")}
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
    <Card glow className="overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-brand/15 blur-[100px]"
      />
      <div className="relative flex flex-col gap-7 p-6 sm:p-8">
        <WizardProgress
          steps={STEPS.map((s) => ({ id: s.id, short: t(`steps.${s.id}.short`) }))}
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
                <h2 className="text-xl font-semibold tracking-tight text-ink">
                  {t(`steps.${current.id}.title`)}
                </h2>
                <p className="text-sm text-muted">{t(`steps.${current.id}.description`)}</p>
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
            {t("common:actions.back")}
          </Button>

          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-faint sm:inline">
              {t("page.stepProgress", { current: step + 1, total: STEPS.length })}
            </span>
            {isLast ? (
              <Button
                type="button"
                size="lg"
                onClick={submit}
                loading={createAgent.isPending}
                rightIcon={<span aria-hidden>→</span>}
              >
                {t("page.createTwin")}
              </Button>
            ) : (
              <Button type="button" size="lg" onClick={next} rightIcon={<span aria-hidden>→</span>}>
                {t("common:actions.continue")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
