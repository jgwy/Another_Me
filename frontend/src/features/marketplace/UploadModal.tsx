import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../lib/api";
import type { MarketplaceKind } from "../../lib/api";
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
  { value: "agent", label: "Agent twin" },
  { value: "skill", label: "Skill module" },
];

/**
 * Lists one of the caller's owned agents — or a brand-new skill module — on the
 * marketplace. Submits through `useCreateMarketplaceItem`, which falls back to
 * the typed mock store while the backend endpoint is still stubbed.
 */
export function UploadModal({ open, onClose }: UploadModalProps) {
  const [kind, setKind] = useState<MarketplaceKind>("agent");
  const [agentId, setAgentId] = useState("");
  const [refId, setRefId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
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
    setErrors({});
  };

  const handleClose = () => {
    create.reset();
    reset();
    onClose();
  };

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!title.trim()) next.title = "Give your listing a title.";
    if (kind === "agent" && !agentId) next.agentId = "Pick one of your agents.";
    const priceNum = Number(price);
    if (price.trim() !== "" && (!Number.isFinite(priceNum) || priceNum < 0)) {
      next.price = "Price must be 0 or more.";
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
      });
      handleClose();
    } catch {
      // Surfaced via `formError` below.
    }
  };

  const formError = create.isError
    ? create.error instanceof ApiError
      ? create.error.detail
      : "Could not list your item. Please try again."
    : null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="List on the marketplace"
      description="Share an agent twin or a skill module. Others spend points to fork a copy."
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} loading={create.isPending} disabled={noAgents}>
            List it
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Select
          label="What are you listing?"
          value={kind}
          onChange={(e) => setKind(e.target.value as MarketplaceKind)}
          options={KIND_OPTIONS}
        />

        {kind === "agent" ? (
          agentsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Spinner size={16} /> Loading your agents…
            </div>
          ) : agentOptions.length > 0 ? (
            <Select
              label="Agent"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              options={agentOptions}
              placeholder="Select an agent"
              error={errors.agentId}
              hint="Buyers fork a private copy of this twin."
            />
          ) : (
            <div className="rounded-xl border border-border/60 bg-surface-2/40 px-3.5 py-3 text-sm text-muted">
              You don't have any agents yet.{" "}
              <Link to="/agents/new" className="font-medium text-brand hover:underline">
                Create one
              </Link>{" "}
              to list it on the market.
            </div>
          )
        ) : (
          <Input
            label="Skill reference ID"
            value={refId}
            onChange={(e) => setRefId(e.target.value)}
            placeholder="Auto-generated if left blank"
            hint="Optional — identifies the skill module. The title and description define the skill."
          />
        )}

        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "agent" ? "e.g. Ada — Sharp VC Twin" : "e.g. Growth modeling (Python)"}
          error={errors.title}
        />

        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does it do well? When should someone fork it?"
          rows={3}
        />

        <Input
          label="Price (points)"
          type="number"
          min={0}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          hint="0 = free. Points are simulated — no real payment."
          error={errors.price}
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
