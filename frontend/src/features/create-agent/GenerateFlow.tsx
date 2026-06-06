/**
 * The two generative create entries (plan §3): "自然语言引导" (`mode="nl"`) and
 * "粘贴语料" (`mode="corpus"`). Both share one flow:
 *
 *   describe / paste  →  `useGenerateAgent()`  →  review clarifying `questions`
 *   →  edit the returned `prompt_config` in the dual-mode {@link PromptConfigEditor}
 *   →  pick library skills + tweak generated skills  →  `useCreateAgent()`.
 *
 * The input stays editable after generation so the user can fold the follow-up
 * questions back into their description and regenerate. Each regeneration bumps
 * `genKey`, remounting the editor so its JSON draft re-seeds from the fresh draft.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { AgentCreate, AgentGenerateMode, PromptConfig, UploadedSkill } from "../../lib/api";
import { useCreateAgent, useGenerateAgent } from "../../lib/queries";
import { fadeUp, spring, staggerContainer } from "../../lib/anim";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Textarea } from "../../components/ui/Textarea";
import { Badge } from "../../components/ui/Badge";
import { Avatar } from "../../components/ui/Avatar";

import { cleanSkills } from "./questionnaire";
import { EmojiPicker } from "./fields";
import { PromptConfigEditor } from "./PromptConfigEditor";
import { SkillSelector } from "./SkillSelector";
import { SkillUploader } from "./SkillUploader";

export interface GenerateFlowProps {
  mode: AgentGenerateMode;
}

export function GenerateFlow({ mode }: GenerateFlowProps) {
  const navigate = useNavigate();
  const { t } = useTranslation(["create", "common"]);
  const reduce = useReducedMotion() ?? false;

  const generate = useGenerateAgent();
  const createAgent = useCreateAgent();

  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [cfg, setCfg] = useState<PromptConfig | null>(null);
  const [persona, setPersona] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [uploaded, setUploaded] = useState<UploadedSkill[]>([]);
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [genKey, setGenKey] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);

  const generated = cfg !== null;

  const handleGenerate = async () => {
    if (!input.trim()) {
      setLocalError(t("generate.inputRequired"));
      return;
    }
    setLocalError(null);
    try {
      const res = await generate.mutateAsync({
        mode,
        input: input.trim(),
        name: name.trim() || undefined,
      });
      setCfg(res.prompt_config);
      setPersona(res.persona);
      setTags(res.profile_tags);
      setQuestions(res.questions);
      setName((prev) => prev.trim() || res.name);
      setUploaded(res.skills.map((s) => ({ name: s.name, content: s.content })));
      setGenKey((k) => k + 1);
    } catch {
      /* surfaced via generate.isError banner */
    }
  };

  const handleCreate = async () => {
    if (!cfg) return;
    const finalName = name.trim() || cfg.identity.name.trim();
    if (!finalName) {
      setLocalError(t("generate.nameRequired"));
      return;
    }
    setLocalError(null);
    const body: AgentCreate = {
      name: finalName,
      questionnaire: {},
      prompt_config: { ...cfg, identity: { ...cfg.identity, name: cfg.identity.name.trim() || finalName } },
      uploaded_skills: cleanSkills(uploaded),
      skill_ids: skillIds,
      avatar: avatar.trim() ? avatar.trim() : null,
    };
    try {
      const created = await createAgent.mutateAsync(body);
      navigate(`/agents/${created.id}`);
    } catch {
      /* surfaced via createAgent.isError banner */
    }
  };

  const generateError = generate.isError ? generate.error?.message || t("generate.generateError") : null;
  const createError = createAgent.isError ? createAgent.error?.message || t("page.createError") : null;
  const banner = localError ?? generateError ?? createError;

  return (
    <div className="flex flex-col gap-6">
      {/* Input */}
      <Card glow className="overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-brand/15 blur-[100px]"
        />
        <div className="relative flex flex-col gap-5 p-6 sm:p-8">
          <Input
            label={t("generate.nameLabel")}
            placeholder={t("generate.namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Textarea
            label={t(`generate.${mode}.inputLabel`)}
            placeholder={t(`generate.${mode}.inputPlaceholder`)}
            rows={mode === "corpus" ? 12 : 8}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <div className="flex items-center justify-end">
            <Button
              type="button"
              size="lg"
              onClick={handleGenerate}
              loading={generate.isPending}
              rightIcon={<span aria-hidden>✦</span>}
            >
              {generated ? t("generate.regenerate") : t(`generate.${mode}.submit`)}
            </Button>
          </div>
        </div>
      </Card>

      <AnimatePresence>
        {banner && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={spring.snappy}
            className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
          >
            {banner}
          </motion.div>
        )}
      </AnimatePresence>

      {!generated ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <span className="text-2xl" aria-hidden>
            ✨
          </span>
          <p className="max-w-sm text-sm text-muted">{t("generate.emptyDraft")}</p>
        </Card>
      ) : (
        <motion.div
          className="flex flex-col gap-6"
          variants={staggerContainer(0.06)}
          initial={reduce ? false : "hidden"}
          animate="show"
        >
          {/* Clarifying follow-ups */}
          {questions.length > 0 && (
            <motion.div variants={reduce ? undefined : fadeUp} transition={spring.soft}>
              <Card className="flex flex-col gap-3 p-6">
                <div className="flex items-center gap-2">
                  <span aria-hidden>💡</span>
                  <h3 className="text-sm font-semibold tracking-tight text-ink">
                    {t("generate.questionsTitle")}
                  </h3>
                </div>
                <p className="text-xs text-muted">{t("generate.questionsHint")}</p>
                <ul className="flex flex-col gap-2">
                  {questions.map((q, i) => (
                    <li
                      key={`${i}-${q}`}
                      className="flex items-start gap-2.5 rounded-xl bg-surface-2/40 px-3.5 py-2.5 text-sm text-ink ring-1 ring-border/40"
                    >
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand">
                        {i + 1}
                      </span>
                      <span>{q}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </motion.div>
          )}

          {/* Draft brain */}
          <motion.div variants={reduce ? undefined : fadeUp} transition={spring.soft}>
            <Card className="flex flex-col gap-5 p-6">
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-semibold tracking-tight text-ink">
                  {t("generate.draftTitle")}
                </h3>
                <p className="text-sm text-muted">{t("generate.draftHint")}</p>
              </div>

              <div className="flex items-center gap-4 rounded-2xl bg-surface-2/40 p-4 ring-1 ring-border/40">
                <Avatar name={name || t("page.twinFallback")} avatar={avatar || null} size="lg" />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-sm font-semibold text-ink">
                    {name.trim() || t("page.twinFallback")}
                  </span>
                  {persona && <span className="line-clamp-2 text-xs text-muted">{persona}</span>}
                </div>
              </div>

              {tags.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium tracking-wide text-muted">
                    {t("generate.tagsLabel")}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <Badge key={tag} tone="brand">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium tracking-wide text-muted">
                  {t("generate.avatar")}
                </span>
                <EmojiPicker value={avatar} onChange={setAvatar} />
              </div>

              {cfg && (
                <PromptConfigEditor key={genKey} value={cfg} onChange={setCfg} name={name} />
              )}
            </Card>
          </motion.div>

          {/* Skills */}
          <motion.div variants={reduce ? undefined : fadeUp} transition={spring.soft}>
            <Card className="flex flex-col gap-5 p-6">
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold tracking-tight text-ink">
                  {t("skillSelect.selectTitle")}
                </h3>
                <p className="text-xs text-muted">{t("skillSelect.hint")}</p>
                <SkillSelector value={skillIds} onChange={setSkillIds} />
              </div>
              <div className="flex flex-col gap-3 border-t border-border/40 pt-5">
                <h3 className="text-sm font-semibold tracking-tight text-ink">
                  {t("skillSelect.uploadTitle")}
                </h3>
                <SkillUploader skills={uploaded} onChange={setUploaded} />
              </div>
            </Card>
          </motion.div>

          {/* Create */}
          <motion.div
            variants={reduce ? undefined : fadeUp}
            transition={spring.soft}
            className="flex items-center justify-end gap-3"
          >
            <Button
              type="button"
              size="lg"
              onClick={handleCreate}
              loading={createAgent.isPending}
              rightIcon={<span aria-hidden>→</span>}
            >
              {t("generate.create")}
            </Button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
