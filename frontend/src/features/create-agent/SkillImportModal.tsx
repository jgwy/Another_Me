/**
 * Skill-pack importer (plan §5): upload a `.zip` that contains a `SKILL.md`,
 * call `POST /api/skills/import`, and preview the parsed manifest + body before
 * the new library skill is auto-selected back in {@link SkillSelector}.
 */
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "../../lib/api";
import type { Skill } from "../../lib/api";
import { useImportSkill } from "../../lib/queries";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Toggle } from "./fields";

export interface SkillImportModalProps {
  open: boolean;
  onClose: () => void;
  /** Attach the imported skill to this owned agent (null ⇒ a library skill). */
  agentId?: string | null;
  /** Fired with the freshly-imported skill (e.g. to auto-select it). */
  onImported?: (skill: Skill) => void;
}

function UploadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 16V4m0 0L7 9m5-5 5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SkillImportModal({ open, onClose, agentId, onImported }: SkillImportModalProps) {
  const { t } = useTranslation(["create", "common"]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [imported, setImported] = useState<Skill | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const importer = useImportSkill();

  const reset = () => {
    setFile(null);
    setIsPublic(false);
    setImported(null);
    setLocalError(null);
    importer.reset();
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSubmit = async () => {
    if (!file) {
      setLocalError(t("skillImport.noFile"));
      return;
    }
    setLocalError(null);
    try {
      const skill = await importer.mutateAsync({ file, is_public: isPublic, agent_id: agentId ?? null });
      setImported(skill);
      onImported?.(skill);
    } catch {
      // Surfaced via formError below.
    }
  };

  const formError = localError
    ? localError
    : importer.isError
      ? importer.error instanceof ApiError
        ? importer.error.detail
        : t("skillImport.error")
      : null;

  const manifest = imported?.manifest ?? null;
  const triggers = Array.isArray(manifest?.triggers) ? (manifest!.triggers as string[]) : [];
  const resources = imported?.resources ?? [];
  const previewBody = (imported?.skill_md || imported?.prompt_body || imported?.content || "").trim();

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t("skillImport.title")}
      description={t("skillImport.description")}
      footer={
        imported ? (
          <Button onClick={handleClose}>{t("skillImport.done")}</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={handleClose} disabled={importer.isPending}>
              {t("common:actions.cancel")}
            </Button>
            <Button onClick={() => void onSubmit()} loading={importer.isPending} disabled={!file}>
              {t("skillImport.submit")}
            </Button>
          </>
        )
      }
    >
      {imported ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Badge tone="success">{t("skillImport.successTitle")}</Badge>
            <span className="truncate text-sm font-medium text-ink">{imported.name}</span>
            {manifest?.version && (
              <Badge tone="neutral" className="font-mono">
                {t("skillImport.version")} {String(manifest.version)}
              </Badge>
            )}
          </div>

          {imported.description && (
            <p className="text-sm leading-relaxed text-muted">{imported.description}</p>
          )}

          {triggers.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium tracking-wide text-muted">
                {t("skillImport.triggers")}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {triggers.map((trig, i) => (
                  <span key={i} className="chip bg-surface-2/70 text-faint">
                    {trig}
                  </span>
                ))}
              </div>
            </div>
          )}

          {resources.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium tracking-wide text-muted">
                {t("skillImport.resources")}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {resources.map((r, i) => (
                  <span key={i} className="chip bg-surface-2/70 font-mono text-faint">
                    {String(r.path ?? r.ref ?? `#${i}`)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {previewBody && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium tracking-wide text-muted">
                {t("skillImport.preview")}
              </span>
              <pre className="max-h-56 overflow-auto rounded-xl bg-surface-2/50 p-3.5 text-xs leading-relaxed text-ink ring-1 ring-border/40">
                {previewBody}
              </pre>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 bg-surface-2/40 px-6 py-10 text-center transition-colors hover:border-brand/50 hover:bg-surface-2/70"
          >
            <span className="text-faint">
              <UploadIcon />
            </span>
            <span className="text-sm font-medium text-ink">
              {file ? file.name : t("skillImport.choose")}
            </span>
            <span className="text-xs text-faint">{t("skillImport.filePlaceholder")}</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setLocalError(null);
            }}
          />

          <Toggle
            checked={isPublic}
            onChange={setIsPublic}
            label={t("skillImport.isPublic")}
            description={t("skillImport.isPublicHint")}
          />

          {formError && (
            <div className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
              {formError}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
