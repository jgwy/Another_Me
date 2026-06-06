/**
 * Editor for the agent's uploaded skills (R2). Each skill is a `{name, content}`
 * pair; users can add several and remove any. Empty drafts are pruned at submit
 * time by `cleanSkills`, so partial rows here are harmless.
 */
import { AnimatePresence, motion } from "motion/react";
import type { UploadedSkill } from "../../lib/api";
import { spring } from "../../lib/anim";
import { Input } from "../../components/ui/Input";
import { Textarea } from "../../components/ui/Textarea";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";

export function SkillUploader({
  skills,
  onChange,
}: {
  skills: UploadedSkill[];
  onChange: (next: UploadedSkill[]) => void;
}) {
  const add = () => onChange([...skills, { name: "", content: "" }]);

  const update = (index: number, patch: Partial<UploadedSkill>) => {
    onChange(skills.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const remove = (index: number) => {
    onChange(skills.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-4">
      {skills.length === 0 ? (
        <EmptyState
          icon={<span>🧩</span>}
          title="No skills yet"
          description="Paste a playbook, a notebook, or any knowledge your twin should carry into a scene."
          action={
            <Button type="button" variant="secondary" onClick={add}>
              Add a skill
            </Button>
          }
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {skills.map((skill, i) => (
                <motion.li
                  key={i}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={spring.soft}
                  className="flex flex-col gap-3 rounded-2xl bg-surface-2/40 p-4 ring-1 ring-border/40"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-2 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-xs font-semibold text-brand">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <Input
                        placeholder="Skill name — e.g. Growth modeling"
                        value={skill.name}
                        onChange={(e) => update(i, { name: e.target.value })}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      className="mt-2.5 shrink-0 rounded-md px-2 text-sm text-faint transition-colors hover:text-danger"
                      aria-label={`Remove skill ${i + 1}`}
                    >
                      Remove
                    </button>
                  </div>
                  <Textarea
                    placeholder="What this skill is and how your twin should use it…"
                    rows={3}
                    value={skill.content}
                    onChange={(e) => update(i, { content: e.target.value })}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          <div>
            <Button type="button" variant="secondary" onClick={add} leftIcon={<span>＋</span>}>
              Add another skill
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
