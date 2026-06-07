import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { Participant } from "../../lib/api";
import { useConversation, useScenario } from "../../lib/queries";
import { cn } from "../../lib/cn";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Spinner } from "../../components/ui/Spinner";
import { PageHeader } from "../../components/layout/PageHeader";
import { MessageBubble } from "./MessageBubble";
import { SandboxBubble } from "./SandboxBubble";
import { useSpectate } from "./useSpectate";

const SEAT_COLOR: Record<number, string> = { 1: "#4f6f37", 2: "#b35c30" };

function VersusHeader({ participants }: { participants: Participant[] }) {
  const { t } = useTranslation(["conversation", "common"]);
  const seat1 = participants.find((p) => p.seat === 1) ?? participants[0];
  const seat2 = participants.find((p) => p.seat === 2) ?? participants[1];
  return (
    <div className="flex items-center justify-center gap-4 py-1">
      {[seat1, seat2].map((p, idx) =>
        p ? (
          <div key={p.id} className={cn("flex items-center gap-3", idx === 1 && "flex-row-reverse text-right")}>
            <Avatar name={p.agent.name} avatar={p.agent.avatar} size="md" />
            <div className={cn("flex flex-col", idx === 1 && "items-end")}>
              <span className="text-sm font-semibold text-ink">{p.agent.name}</span>
              <span className="text-xs" style={{ color: SEAT_COLOR[p.seat] }}>
                {t("spectate.seat", { seat: p.seat })}
              </span>
            </div>
            {idx === 0 && <span className="px-1 font-mono text-sm text-faint">{t("common:vs")}</span>}
          </div>
        ) : null,
      )}
    </div>
  );
}

export function SpectatePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation(["conversation", "common"]);
  const conversationQuery = useConversation(id);
  const conversation = conversationQuery.data;
  const scenarioQuery = useScenario(conversation?.scenario_id);
  const scenario = scenarioQuery.data;
  const { items, status, restart } = useSpectate(id);

  const seatByAgent = useMemo(() => {
    const m = new Map<string, Participant>();
    conversation?.participants.forEach((p) => m.set(p.agent_id, p));
    return m;
  }, [conversation]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [items, status]);

  if (conversationQuery.isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner size={26} className="text-brand" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <p className="text-muted">{t("spectate.notFound")}</p>
        <Button variant="secondary" onClick={() => navigate("/")}>
          {t("spectate.backToIsland")}
        </Button>
      </div>
    );
  }

  const statusTone = status === "ended" ? "neutral" : status === "error" ? "danger" : "success";
  const statusLabel =
    status === "connecting"
      ? t("spectate.status.takingSeats")
      : status === "streaming"
        ? t("spectate.status.live")
        : status === "ended"
          ? t("spectate.status.ended")
          : t("spectate.status.disconnected");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={t("spectate.eyebrow")}
        backTo="/"
        backLabel={t("spectate.backLabel")}
        title={conversation.title ?? scenario?.name ?? t("spectate.fallbackTitle")}
        description={scenario ? scenario.description : undefined}
        actions={
          <Badge tone={statusTone}>
            {(status === "streaming" || status === "connecting") && (
              <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            )}
            {statusLabel}
          </Badge>
        }
      />

      <Card glass className="px-4 py-3">
        <VersusHeader participants={conversation.participants} />
      </Card>

      <Card className="flex flex-col overflow-hidden">
        <div ref={scrollRef} className="flex max-h-[58vh] min-h-[320px] flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6">
          {status === "connecting" && items.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
              <Spinner className="text-muted" /> {t("spectate.takingSeats")}
            </div>
          )}

          <AnimatePresence initial={false}>
            {items.map((item) => {
              if (item.kind === "sandbox") {
                const p = item.agent_id ? seatByAgent.get(item.agent_id) : undefined;
                return (
                  <SandboxBubble
                    key={item.id}
                    side={p?.seat === 2 ? "right" : "left"}
                    agentName={p?.agent.name}
                    language={item.language}
                    stdout={item.stdout}
                    stderr={item.stderr}
                    exitCode={item.exit_code}
                    durationMs={item.duration_ms}
                  />
                );
              }

              if (item.sender === "system") {
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mx-auto max-w-md rounded-full bg-surface-2/60 px-3.5 py-1.5 text-center text-xs text-faint ring-1 ring-border/40"
                  >
                    {item.content}
                  </motion.div>
                );
              }

              const p = item.agent_id ? seatByAgent.get(item.agent_id) : undefined;
              const seat = p?.seat ?? 1;
              return (
                <MessageBubble
                  key={item.id}
                  side={seat === 2 ? "right" : "left"}
                  name={p?.agent.name ?? t("agentFallback")}
                  avatar={p?.agent.avatar}
                  color={SEAT_COLOR[seat] ?? "#4f6f37"}
                  turnIndex={item.turn_index}
                  content={item.content}
                  streaming={!item.done}
                />
              );
            })}
          </AnimatePresence>

          {status === "ended" && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 flex flex-col items-center gap-3 rounded-2xl border border-border/50 bg-surface-2/40 px-4 py-5 text-center"
            >
              <span className="text-sm text-muted">{t("spectate.ended")}</span>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button size="sm" onClick={() => navigate(`/conversations/${conversation.id}/report`)}>
                  {t("spectate.viewReport")}
                </Button>
                <Button size="sm" variant="secondary" onClick={restart}>
                  {t("spectate.replay")}
                </Button>
              </div>
            </motion.div>
          )}
        </div>

        {/* Read-only spectator bar — no composer, by design (R10 / AE2). */}
        <div className="flex items-center justify-center gap-2 border-t border-border/50 bg-surface/60 px-4 py-3 text-xs text-faint">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {t("spectate.spectatorNote")}
        </div>
      </Card>
    </div>
  );
}
