/**
 * Create-a-scenario form (plan §2, "open scenarios"): lets a user author their
 * own stage via `POST /api/scenarios` (real endpoint; falls back to a typed mock
 * + demo pill until it succeeds against a live backend).
 *
 * Reachable at `/scenarios/new` (registered in routes/router.tsx) via the island
 * HUD "新建场景" affordance and the top-nav "New scene" link.
 */
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import { ApiError } from "../../lib/api";
import type { Scenario, ScenarioKind } from "../../lib/api";
import { useCreateScenario, useDemoMode } from "../../lib/queries";
import { fadeUp } from "../../lib/anim";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { ListEditor, Toggle } from "../create-agent/fields";

const KINDS: ScenarioKind[] = ["business", "empathy", "generic"];

interface FieldErrors {
  name?: string;
  scenePrompt?: string;
}

export function CreateScenarioPage() {
  const { t } = useTranslation(["scenarios", "common"]);
  const reduce = useReducedMotion() ?? false;
  const demo = useDemoMode();
  const createScenario = useCreateScenario();

  const [name, setName] = useState("");
  const [kind, setKind] = useState<ScenarioKind>("generic");
  const [category, setCategory] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [scenePrompt, setScenePrompt] = useState("");
  const [endingPrompt, setEndingPrompt] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [created, setCreated] = useState<Scenario | null>(null);

  const reset = () => {
    setName("");
    setKind("generic");
    setCategory("");
    setTopics([]);
    setScenePrompt("");
    setEndingPrompt("");
    setIsPublic(true);
    setErrors({});
    createScenario.reset();
  };

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!name.trim()) next.name = t("validation.nameRequired");
    if (!scenePrompt.trim()) next.scenePrompt = t("validation.scenePromptRequired");
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      const scenario = await createScenario.mutateAsync({
        name: name.trim(),
        description: "",
        kind,
        topics,
        scene_prompt: scenePrompt.trim(),
        ending_prompt: endingPrompt.trim(),
        category: category.trim() || null,
        is_public: isPublic,
      });
      setCreated(scenario);
    } catch {
      // Surfaced via formError below.
    }
  };

  const formError = createScenario.isError
    ? createScenario.error instanceof ApiError
      ? createScenario.error.detail
      : t("error")
    : null;

  const kindOptions = KINDS.map((k) => ({ value: k, label: t(`kind.${k}`) }));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={t("page.eyebrow")}
        title={t("page.title")}
        description={t("page.description")}
        backTo="/"
        backLabel={t("page.backLabel")}
        actions={demo ? <Badge tone="warning">{t("common:demo.badge")}</Badge> : undefined}
      />

      {created ? (
        <motion.div variants={reduce ? undefined : fadeUp} initial={reduce ? false : "hidden"} animate="show">
          <Card glow className="flex flex-col gap-4 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success">{t("success.title")}</Badge>
              <span className="text-base font-semibold tracking-tight text-ink">{created.name}</span>
              <Badge tone="neutral" className="font-mono">
                {created.key}
              </Badge>
            </div>
            <p className="text-sm leading-relaxed text-muted">{t("success.description")}</p>
            <p className="text-xs text-faint">{t("success.routeNote")}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={() => { setCreated(null); reset(); }}>{t("actions.another")}</Button>
            </div>
          </Card>
        </motion.div>
      ) : (
        <motion.div variants={reduce ? undefined : fadeUp} initial={reduce ? false : "hidden"} animate="show">
          <Card className="flex flex-col gap-5 p-6">
            <Input
              label={t("fields.name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("fields.namePlaceholder")}
              error={errors.name}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <Select
                label={t("fields.kind")}
                value={kind}
                onChange={(e) => setKind(e.target.value as ScenarioKind)}
                options={kindOptions}
                hint={t("fields.kindHint")}
              />
              <Input
                label={t("fields.category")}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={t("fields.categoryPlaceholder")}
                hint={t("fields.categoryHint")}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium tracking-wide text-muted">{t("fields.topics")}</span>
              <span className="text-xs text-faint">{t("fields.topicsHint")}</span>
              <div className="pt-1">
                <ListEditor
                  value={topics}
                  onChange={setTopics}
                  placeholder={t("fields.topicsPlaceholder")}
                  emptyHint={t("fields.topicsEmpty")}
                />
              </div>
            </div>

            <Textarea
              label={t("fields.scenePrompt")}
              value={scenePrompt}
              onChange={(e) => setScenePrompt(e.target.value)}
              placeholder={t("fields.scenePromptPlaceholder")}
              hint={t("fields.scenePromptHint")}
              error={errors.scenePrompt}
              rows={4}
            />

            <Textarea
              label={t("fields.endingPrompt")}
              value={endingPrompt}
              onChange={(e) => setEndingPrompt(e.target.value)}
              placeholder={t("fields.endingPromptPlaceholder")}
              hint={t("fields.endingPromptHint")}
              rows={3}
            />

            <Toggle
              checked={isPublic}
              onChange={setIsPublic}
              label={t("fields.isPublic")}
              description={t("fields.isPublicHint")}
            />

            {formError && (
              <div className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
                {formError}
              </div>
            )}

            <div className="flex justify-end border-t border-border/50 pt-5">
              <Button onClick={() => void onSubmit()} loading={createScenario.isPending}>
                {t("actions.create")}
              </Button>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
