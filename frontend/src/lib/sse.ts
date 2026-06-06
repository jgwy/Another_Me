import { API_BASE_URL } from "./api";
import type { ConversationStatus, MessageSender } from "./api";

/* -------------------------------------------------------------------------- */
/* SSE event payloads — mirror of API contract §4 (LOCKED)                     */
/* -------------------------------------------------------------------------- */

export interface MessageStartEvent {
  conversation_id: string;
  message_id: string;
  seq: number;
  turn_index: number | null;
  agent_id: string | null;
  sender: MessageSender;
}

export interface MessageDeltaEvent {
  conversation_id: string;
  message_id: string;
  seq: number;
  delta: string;
}

export interface MessageEndEvent {
  conversation_id: string;
  message_id: string;
  seq: number;
  turn_index: number | null;
  agent_id: string | null;
  sender: MessageSender;
  content: string;
  meta: Record<string, unknown>;
}

export interface SandboxOutputEvent {
  conversation_id: string;
  message_id: string | null;
  sandbox_run_id: string;
  agent_id: string | null;
  language: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
}

export interface ConversationEndEvent {
  conversation_id: string;
  status: ConversationStatus;
  n_rounds: number;
  report_id: string | null;
}

export interface PingEvent {
  t: string;
}

export interface ConversationStreamHandlers {
  /** Optional JWT, appended as `?token=` for private conversations. */
  token?: string;
  onMessageStart?: (event: MessageStartEvent) => void;
  onMessageDelta?: (event: MessageDeltaEvent) => void;
  onMessageEnd?: (event: MessageEndEvent) => void;
  onSandboxOutput?: (event: SandboxOutputEvent) => void;
  onConversationEnd?: (event: ConversationEndEvent) => void;
  onError?: (error: Event) => void;
}

export interface ConversationStream {
  close: () => void;
}

/**
 * Open a read-only Server-Sent Events stream for a conversation (contract §3.6).
 *
 * Subscribes to the named events from §4, JSON-parses each `event.data` into the
 * matching payload type, and ignores `ping` / unknown events. On `conversation-end`
 * the underlying {@link EventSource} is closed automatically.
 */
export function openConversationStream(
  conversationId: string,
  handlers: ConversationStreamHandlers = {},
): ConversationStream {
  const url = new URL(`${API_BASE_URL}/api/conversations/${conversationId}/stream`);
  if (handlers.token) {
    url.searchParams.set("token", handlers.token);
  }

  const source = new EventSource(url.toString());
  let closed = false;

  const close = (): void => {
    if (closed) return;
    closed = true;
    source.close();
  };

  const parse = <T>(event: MessageEvent): T | null => {
    try {
      return JSON.parse(event.data) as T;
    } catch {
      return null;
    }
  };

  source.addEventListener("message-start", (event) => {
    const data = parse<MessageStartEvent>(event as MessageEvent);
    if (data) handlers.onMessageStart?.(data);
  });

  source.addEventListener("message-delta", (event) => {
    const data = parse<MessageDeltaEvent>(event as MessageEvent);
    if (data) handlers.onMessageDelta?.(data);
  });

  source.addEventListener("message-end", (event) => {
    const data = parse<MessageEndEvent>(event as MessageEvent);
    if (data) handlers.onMessageEnd?.(data);
  });

  source.addEventListener("sandbox-output", (event) => {
    const data = parse<SandboxOutputEvent>(event as MessageEvent);
    if (data) handlers.onSandboxOutput?.(data);
  });

  source.addEventListener("conversation-end", (event) => {
    const data = parse<ConversationEndEvent>(event as MessageEvent);
    if (data) handlers.onConversationEnd?.(data);
    // The stream is finished — close per the client rules in §4.
    close();
  });

  // `ping` keepalives and any unknown event names are intentionally ignored.

  source.onerror = (error) => {
    handlers.onError?.(error);
  };

  return { close };
}
