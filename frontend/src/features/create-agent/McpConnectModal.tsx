/**
 * MCP server importer (plan §5): register an MCP tool server and probe it
 * (`POST /api/mcps` then `/{id}/connect`) so its discovered tools — connected
 * inside the sandbox — can be invoked by skills during an encounter. Secrets
 * (`token`) are write-only and never echoed back.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "../../lib/api";
import type { McpConnectResult, McpServer, McpTransport } from "../../lib/api";
import { useConnectMcp, useCreateMcp } from "../../lib/queries";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { Toggle } from "./fields";

export interface McpConnectModalProps {
  open: boolean;
  onClose: () => void;
  /** Attach the server to this owned agent (null ⇒ a library server). */
  agentId?: string | null;
  onConnected?: (server: McpServer, result: McpConnectResult) => void;
}

const TRANSPORTS: { value: McpTransport; label: string }[] = [
  { value: "sse", label: "SSE" },
  { value: "http", label: "HTTP" },
  { value: "stdio", label: "stdio" },
];

interface FieldErrors {
  name?: string;
  target?: string;
}

export function McpConnectModal({ open, onClose, agentId, onConnected }: McpConnectModalProps) {
  const { t } = useTranslation(["create", "common"]);

  const [name, setName] = useState("");
  const [transport, setTransport] = useState<McpTransport>("sse");
  const [url, setUrl] = useState("");
  const [command, setCommand] = useState("");
  const [token, setToken] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<McpConnectResult | null>(null);

  const create = useCreateMcp();
  const connect = useConnectMcp();
  const pending = create.isPending || connect.isPending;
  const usesUrl = transport !== "stdio";

  const reset = () => {
    setName("");
    setTransport("sse");
    setUrl("");
    setCommand("");
    setToken("");
    setCategory("");
    setDescription("");
    setIsPublic(false);
    setErrors({});
    setResult(null);
    create.reset();
    connect.reset();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!name.trim()) next.name = t("mcp.nameError");
    if (usesUrl ? !url.trim() : !command.trim()) next.target = t("mcp.targetError");
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      const server = await create.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        category: category.trim() || "general",
        transport,
        url: usesUrl ? url.trim() : null,
        command: usesUrl ? null : command.trim(),
        token: token.trim() || null,
        agent_id: agentId ?? null,
        is_public: isPublic,
      });
      const res = await connect.mutateAsync(server.id);
      setResult(res);
      onConnected?.(server, res);
    } catch {
      // Surfaced via formError below.
    }
  };

  const formError =
    create.isError || connect.isError
      ? (create.error ?? connect.error) instanceof ApiError
        ? ((create.error ?? connect.error) as ApiError).detail
        : t("mcp.error")
      : null;

  const statusTone =
    result?.status === "online" ? "success" : result?.status === "error" ? "danger" : "neutral";

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t("mcp.title")}
      description={t("mcp.description")}
      footer={
        result ? (
          <Button onClick={handleClose}>{t("mcp.done")}</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={handleClose} disabled={pending}>
              {t("common:actions.cancel")}
            </Button>
            <Button onClick={() => void onSubmit()} loading={pending}>
              {t("mcp.submit")}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink">{name || t("mcp.title")}</span>
            <Badge tone={statusTone}>
              {t("mcp.status")}: {t(`mcp.statusLabel.${result.status}`)}
            </Badge>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium tracking-wide text-muted">
              {t("mcp.discoveredTitle")}
            </span>
            {result.tools.length === 0 ? (
              <p className="rounded-xl bg-surface-2/40 px-3.5 py-3 text-sm text-faint ring-1 ring-border/40">
                {t("mcp.noTools")}
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {result.tools.map((tool, i) => (
                  <li
                    key={tool.name ?? i}
                    className="flex flex-col gap-0.5 rounded-xl bg-surface-2/40 px-3.5 py-2.5 ring-1 ring-border/40"
                  >
                    <span className="font-mono text-sm text-ink">{tool.name}</span>
                    {tool.description && (
                      <span className="text-xs text-muted">{tool.description}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {result.error && (
            <div className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
              {result.error}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Input
            label={t("mcp.nameLabel")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("mcp.namePlaceholder")}
            error={errors.name}
          />

          <Select
            label={t("mcp.transportLabel")}
            value={transport}
            onChange={(e) => setTransport(e.target.value as McpTransport)}
            options={TRANSPORTS}
          />

          {usesUrl ? (
            <Input
              label={t("mcp.urlLabel")}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t("mcp.urlPlaceholder")}
              error={errors.target}
            />
          ) : (
            <Input
              label={t("mcp.commandLabel")}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder={t("mcp.commandPlaceholder")}
              error={errors.target}
            />
          )}

          <Input
            label={t("mcp.tokenLabel")}
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={t("mcp.tokenPlaceholder")}
          />

          <Input
            label={t("mcp.categoryLabel")}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />

          <Textarea
            label={t("mcp.descriptionLabel")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />

          <Toggle
            checked={isPublic}
            onChange={setIsPublic}
            label={t("mcp.isPublic")}
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
