import { useCallback, useEffect, useState } from "react";

import type { MessageSender } from "../../lib/api";
import { openConversationStream } from "../../lib/sse";
import { mockConversationStream, mockStore } from "../../lib/mocks";

/* -------------------------------------------------------------------------- */
/* Render model                                                                */
/* -------------------------------------------------------------------------- */

export interface StreamMessageItem {
  kind: "message";
  /** message_id */
  id: string;
  seq: number;
  turn_index: number | null;
  agent_id: string | null;
  sender: MessageSender;
  content: string;
  done: boolean;
}

export interface StreamSandboxItem {
  kind: "sandbox";
  /** sandbox_run_id */
  id: string;
  agent_id: string | null;
  language: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
}

export type StreamItem = StreamMessageItem | StreamSandboxItem;
export type SpectateStatus = "connecting" | "streaming" | "ended" | "error";

export interface SpectateState {
  items: StreamItem[];
  status: SpectateStatus;
  reportId: string | null;
  /** Re-subscribe from the top (used after the stream ends). */
  restart: () => void;
}

/**
 * Subscribe to a conversation's live SSE stream and fold the locked events
 * (`message-start` / `message-delta` / `message-end` / `sandbox-output` /
 * `conversation-end`) into an ordered list of render items.
 *
 * Real backend conversations use {@link openConversationStream}; demo/seeded
 * conversations (present in the mock store) use {@link mockConversationStream}.
 * Both share the identical handler interface, so this is a one-line swap at
 * integration time.
 */
export function useSpectate(conversationId: string | undefined): SpectateState {
  const [items, setItems] = useState<StreamItem[]>([]);
  const [status, setStatus] = useState<SpectateStatus>("connecting");
  const [reportId, setReportId] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!conversationId) return;
    setItems([]);
    setStatus("connecting");
    setReportId(null);

    const open = mockStore.getConversation(conversationId)
      ? mockConversationStream
      : openConversationStream;

    const stream = open(conversationId, {
      onMessageStart: (e) => {
        setStatus("streaming");
        setItems((prev) =>
          prev.some((i) => i.id === e.message_id)
            ? prev
            : [
                ...prev,
                {
                  kind: "message",
                  id: e.message_id,
                  seq: e.seq,
                  turn_index: e.turn_index,
                  agent_id: e.agent_id,
                  sender: e.sender,
                  content: "",
                  done: false,
                },
              ],
        );
      },
      onMessageDelta: (e) => {
        setItems((prev) =>
          prev.map((i) =>
            i.kind === "message" && i.id === e.message_id
              ? { ...i, content: i.content + e.delta }
              : i,
          ),
        );
      },
      onMessageEnd: (e) => {
        setItems((prev) => {
          if (prev.some((i) => i.id === e.message_id)) {
            return prev.map((i) =>
              i.kind === "message" && i.id === e.message_id
                ? { ...i, content: e.content, done: true }
                : i,
            );
          }
          return [
            ...prev,
            {
              kind: "message",
              id: e.message_id,
              seq: e.seq,
              turn_index: e.turn_index,
              agent_id: e.agent_id,
              sender: e.sender,
              content: e.content,
              done: true,
            },
          ];
        });
      },
      onSandboxOutput: (e) => {
        setItems((prev) =>
          prev.some((i) => i.id === e.sandbox_run_id)
            ? prev
            : [
                ...prev,
                {
                  kind: "sandbox",
                  id: e.sandbox_run_id,
                  agent_id: e.agent_id,
                  language: e.language,
                  stdout: e.stdout,
                  stderr: e.stderr,
                  exit_code: e.exit_code,
                  duration_ms: e.duration_ms,
                },
              ],
        );
      },
      onConversationEnd: (e) => {
        setStatus("ended");
        setReportId(e.report_id);
      },
      onError: () => {
        setStatus((prev) => (prev === "ended" ? prev : "error"));
      },
    });

    return () => stream.close();
  }, [conversationId, nonce]);

  const restart = useCallback(() => setNonce((n) => n + 1), []);

  return { items, status, reportId, restart };
}
