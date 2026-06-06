import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../lib/api";
import type { MarketplaceForkMode, MarketplaceKind } from "../../lib/api";
import { useAgents, useCreateMarketplaceItem } from "../../lib/queries";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { Spinner } from "../../components/ui/Spinner";
import { Textarea } from "../../components/ui/Textarea";

export interface UploadModalProps {
  open: boolean;
  onClose: () => void;
}

interface FieldErrors {
  title?: string;
  agentId?: string;
  price?: string;
}

const KIND_OPTIONS = [
  { value: "agent", labelKey: "upload.kindAgent" },
  { value: "skill", labelKey: "upload.kindSkill" },
] as const;

const FORK_MODE_OPTIONS = [
  { value: "editable", labelKey: "forkMode.editable" },
  { value: "locked", labelKey: "forkMode.locked" },
] as const;

/**
 * Lists one of the caller's owned agents — or a brand-new skill module — on the
 * marketplace. Submits through `useCreateMarketplaceItem`, which falls back to
 * the typed mock store while the backend endpoint is still stubbed.
 */
export function UploadModal({ open, onClose }: UploadModalProps) {
  const { t } = useTranslation(["marketplace", "common"]);
  const [kind, setKind] = useState<MarketplaceKind>("agent");
  const [agentId, setAgentId] = useState("");
  const [refId, setRefId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [forkMode, setForkMode] = useState<MarketplaceForkMode>("editable");
  const [errors, setErrors] = useState<FieldErrors>({});

  const agentsQuery = useAgents({ owner: "me" });
  const create = useCreateMarketplaceItem();

  const agentOptions = (agentsQuery.data?.items ?? []).map((a) => ({ value: a.id, label: a.name }));
  const firstAgentId = agentsQuery.data?.items[0]?.id;
  const noAgents = kind === "agent" && !agentsQuery.isLoading && agentOptions.length === 0;

  // Default the picker to the caller's first agent so listing is one click.
  useEffect(() => {
    if (kind === "agent" && !agentId && firstAgentId) setAgentId(firstAgentId);
  }, [kind, agentId, firstAgentId]);

  const reset = () => {
    setKind("agent");
    setAgentId("");
    setRefId("");
    setTitle("");
    setDescription("");
    setPrice("0");
    setForkMode("editable");
    setErrors({});
  };

  const handleClose = () => {
    create.reset();
    reset();
    onClose();
  };

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!title.trim()) next.title = t("upload.titleError");
    if (kind === "agent" && !agentId) next.agentId = t("upload.agentError");
    const priceNum = Number(price);
    if (price.trim() !== "" && (!Number.isFinite(priceNum) || priceNum < 0)) {
      next.price = t("upload.priceError");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    const refValue = kind === "agent" ? agentId : refId.trim() || crypto.randomUUID();
    const priceValue = Math.max(0, Math.floor(Number(price) || 0));
    try {
      await create.mutateAsync({
        kind,
        ref_id: refValue,
        title: title.trim(),
        description: description.trim() ? description.trim() : null,
        price_points: priceValue,
        fork_mode: forkMode,
      });
      handleClose();
    } catch {
      // Surfaced via `formError` below.
    }
  };

  const formError = create.isError
    ? create.error instanceof ApiError
      ? create.error.detail
      : t("upload.submitError")
    : null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t("upload.title")}
      description={t("upload.description")}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={create.isPending}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={() => void onSubmit()} loading={create.isPending} disabled={noAgents}>
            {t("upload.submit")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Select
          label={t("upload.whatLabel")}
          value={kind}
          onChange={(e) => setKind(e.target.value as MarketplaceKind)}
          options={KIND_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
        />

        {kind === "agent" ? (
          agentsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Spinner size={16} /> {t("upload.loadingAgents")}
            </div>
          ) : agentOptions.length > 0 ? (
            <Select
              label={t("upload.agentLabel")}
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              options={agentOptions}
              placeholder={t("upload.agentPlaceholder")}
              error={errors.agentId}
              hint={t("upload.agentHint")}
            />
          ) : (
            <div className="rounded-xl border border-border/60 bg-surface-2/40 px-3.5 py-3 text-sm text-muted">
              {t("upload.noAgentsPrefix")}
              <Link to="/agents/new" className="font-medium text-brand hover:underline">
                {t("upload.noAgentsLink")}
              </Link>
              {t("upload.noAgentsSuffix")}
            </div>
          )
        ) : (
          <Input
            label={t("upload.refLabel")}
            value={refId}
            onChange={(e) => setRefId(e.target.value)}
            placeholder={t("upload.refPlaceholder")}
            hint={t("upload.refHint")}
          />
        )}

        <Input
          label={t("upload.titleLabel")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "agent" ? t("upload.titlePlaceholderAgent") : t("upload.titlePlaceholderSkill")}
          error={errors.title}
        />

        <Textarea
          label={t("upload.descriptionLabel")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("upload.descriptionPlaceholder")}
          rows={3}
        />

        <Input
          label={t("upload.priceLabel")}
          type="number"
          min={0}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          hint={t("upload.priceHint")}
          error={errors.price}
        />

        <Select
          label={t("upload.forkModeLabel")}
          value={forkMode}
          onChange={(e) => setForkMode(e.target.value as MarketplaceForkMode)}
          options={FORK_MODE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
          hint={t("upload.forkModeHint")}
        />

        {formError && (
          <div className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            {formError}
          </div>
        )}
      </div>
    </Modal>
  );
}
