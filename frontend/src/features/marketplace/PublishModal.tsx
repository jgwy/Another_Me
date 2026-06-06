import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../lib/api";
import type { MarketplaceItem } from "../../lib/api";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Textarea } from "../../components/ui/Textarea";
import { usePublishMarketplaceItem } from "../../lib/queries";

export interface PublishModalProps {
  /** The owned listing to publish a new version of; `null` keeps it closed. */
  item: MarketplaceItem | null;
  open: boolean;
  onClose: () => void;
  /** Fired with the freshly published version number on success. */
  onPublished?: (version: number) => void;
}

/**
 * Marketplace v2 (owner-only): freeze a listing's current source as a new
 * immutable version with an optional changelog. Ownership is gated by the
 * caller — this modal only renders the form + mutation.
 */
export function PublishModal({ item, open, onClose, onPublished }: PublishModalProps) {
  const { t } = useTranslation(["marketplace", "common"]);
  const [changelog, setChangelog] = useState("");
  const publish = usePublishMarketplaceItem();

  // Retain the last opened listing so title/version don't flash while the modal
  // animates out (the parent clears `item` the moment it closes).
  const [shown, setShown] = useState<MarketplaceItem | null>(item);
  useEffect(() => {
    if (item) setShown(item);
  }, [item]);

  const nextVersion = (shown?.version ?? 1) + 1;

  const handleClose = () => {
    publish.reset();
    setChangelog("");
    onClose();
  };

  const onSubmit = async () => {
    if (!shown) return;
    try {
      const updated = await publish.mutateAsync({
        id: shown.id,
        body: { changelog: changelog.trim() ? changelog.trim() : null },
      });
      onPublished?.(updated.version ?? nextVersion);
      handleClose();
    } catch {
      // Surfaced via `formError` below.
    }
  };

  const formError = publish.isError
    ? publish.error instanceof ApiError
      ? publish.error.detail
      : t("publish.error")
    : null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="sm"
      title={t("publish.title")}
      description={shown ? t("publish.description", { title: shown.title }) : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={publish.isPending}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={() => void onSubmit()} loading={publish.isPending}>
            {t("publish.submit")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <Badge tone="brand" className="font-mono">
            {t("publish.nextVersion", { version: nextVersion })}
          </Badge>
        </div>

        <Textarea
          label={t("publish.changelogLabel")}
          value={changelog}
          onChange={(e) => setChangelog(e.target.value)}
          placeholder={t("publish.changelogPlaceholder")}
          hint={t("publish.changelogHint")}
          rows={4}
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
