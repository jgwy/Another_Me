import { getStoredToken } from "../store/auth";

/**
 * Base URL for the backend. Configured via `VITE_API_BASE_URL`; falls back to
 * the local compose default. Trailing slashes are trimmed so we can safely
 * concatenate paths like `/api/auth/login`.
 */
export const API_BASE_URL: string = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

/* -------------------------------------------------------------------------- */
/* Data objects — mirror of API contract §2 (snake_case, UUID strings)         */
/* -------------------------------------------------------------------------- */

export interface User {
  id: string;
  email: string;
  username: string;
  points: number;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export type SkillSource = "questionnaire" | "upload" | "evolved";

export interface Skill {
  id: string;
  agent_id: string | null;
  owner_id: string;
  name: string;
  content: string;
  source: SkillSource;
  created_at: string;
}

export interface AgentSummary {
  id: string;
  name: string;
  avatar: string | null;
  profile_tags: string[];
}

export interface AgentRules {
  tone: string;
  dos: string[];
  donts: string[];
}

export interface Agent {
  id: string;
  owner_id: string;
  name: string;
  persona: string;
  rules: AgentRules;
  profile_tags: string[];
  questionnaire: Record<string, unknown>;
  avatar: string | null;
  max_rounds: number;
  is_public: boolean;
  forked_from: string | null;
  skills: Skill[];
  created_at: string;
  updated_at: string;
}

export type ScenarioKey = "exchange" | "cafe" | "lab" | "coding_club";
export type ScenarioKind = "business" | "empathy" | "generic";

export interface ScenarioMeta {
  building: string;
  x: number;
  y: number;
}

export interface Scenario {
  id: string;
  key: ScenarioKey;
  name: string;
  description: string;
  kind: ScenarioKind;
  topics: string[];
  scene_prompt: string;
  ending_prompt: string;
  is_full: boolean;
  meta: ScenarioMeta;
  created_at: string;
}

export type DispatchStatus =
  | "queued"
  | "matched"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface Dispatch {
  id: string;
  agent_id: string;
  scenario_id: string;
  task_prompt: string;
  opponent_agent_id: string | null;
  match_by_profile: boolean;
  status: DispatchStatus;
  created_by: string;
  conversation_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ConversationStatus = "pending" | "running" | "completed" | "failed";

export interface Conversation {
  id: string;
  scenario_id: string;
  status: ConversationStatus;
  n_rounds: number;
  title: string | null;
  participants: Participant[];
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface Participant {
  id: string;
  conversation_id: string;
  agent_id: string;
  /** 1 = agent1, 2 = agent2. Unique per (conversation_id, seat). */
  seat: number;
  role: string | null;
  agent: AgentSummary;
}

export type MessageSender = "agent" | "system" | "sandbox";

export interface Message {
  id: string;
  conversation_id: string;
  seq: number;
  turn_index: number | null;
  agent_id: string | null;
  sender: MessageSender;
  content: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface Report {
  id: string;
  conversation_id: string;
  kind: ScenarioKind;
  summary: string;
  content: Record<string, unknown>;
  created_at: string;
}

export interface Evolution {
  id: string;
  agent_id: string;
  conversation_id: string | null;
  diff: Record<string, unknown>;
  applied: boolean;
  created_at: string;
  applied_at: string | null;
}

export interface SandboxRun {
  id: string;
  conversation_id: string | null;
  agent_id: string | null;
  message_id: string | null;
  language: string;
  code: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
  created_at: string;
}

export type MarketplaceKind = "agent" | "skill";

export interface MarketplaceItem {
  id: string;
  kind: MarketplaceKind;
  ref_id: string;
  owner_id: string;
  title: string;
  description: string | null;
  price_points: number;
  downloads: number;
  created_at: string;
}

/** Paginated list envelope (contract §1). Bounded lists return `T[]` directly. */
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface HealthStatus {
  status: string;
  service: string;
  time: string;
}

/* -------------------------------------------------------------------------- */
/* Error handling                                                              */
/* -------------------------------------------------------------------------- */

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

interface ValidationErrorItem {
  loc?: (string | number)[];
  msg?: string;
  type?: string;
}

/** Pull a human-readable message out of a `{detail}` body, including the
 *  array-form 422 validation payload. Falls back to the provided default. */
function extractDetail(body: unknown, fallback: string): string {
  if (typeof body === "string" && body.trim()) return body;

  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;

    if (Array.isArray(detail)) {
      const messages = (detail as ValidationErrorItem[])
        .map((item) => {
          const loc = Array.isArray(item.loc)
            ? item.loc.filter((part) => part !== "body").join(".")
            : "";
          const msg = item.msg ?? "invalid value";
          return loc ? `${loc}: ${msg}` : msg;
        })
        .filter(Boolean);
      if (messages.length) return messages.join("; ");
    }
  }

  return fallback;
}

/* -------------------------------------------------------------------------- */
/* Fetch client                                                                */
/* -------------------------------------------------------------------------- */

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  /** JSON-serializable request body. */
  body?: unknown;
  /** Attach the bearer token when one is available. Defaults to `true`. */
  auth?: boolean;
  /** Explicit token override (used for SSE / cross-context calls). */
  token?: string;
}

/**
 * Generic typed fetch wrapper. Prefixes the base URL, sends/parses JSON,
 * attaches `Authorization: Bearer <token>` when present, and throws an
 * {@link ApiError} on any non-2xx response.
 */
export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const { body, auth = true, token, headers, ...rest } = opts;
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

  const finalHeaders = new Headers(headers);
  if (!finalHeaders.has("Content-Type")) {
    finalHeaders.set("Content-Type", "application/json");
  }
  const authToken = token ?? (auth ? getStoredToken() : null);
  if (authToken) {
    finalHeaders.set("Authorization", `Bearer ${authToken}`);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError(0, err instanceof Error ? err.message : "Network request failed");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      extractDetail(parsed, res.statusText || `Request failed (${res.status})`),
    );
  }

  return parsed as T;
}

/* -------------------------------------------------------------------------- */
/* Typed helpers — contract §3.1 / §3.2                                        */
/* -------------------------------------------------------------------------- */

export function register(body: {
  email: string;
  username: string;
  password: string;
}): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/register", {
    method: "POST",
    body,
    auth: false,
  });
}

export function login(body: { email: string; password: string }): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/login", {
    method: "POST",
    body,
    auth: false,
  });
}

export function getMe(): Promise<User> {
  return apiFetch<User>("/api/auth/me", { method: "GET" });
}

export function getHealth(): Promise<HealthStatus> {
  return apiFetch<HealthStatus>("/health", { method: "GET", auth: false });
}

/* -------------------------------------------------------------------------- */
/* Query-string helper                                                         */
/* -------------------------------------------------------------------------- */

/** Build a `?a=1&b=2` string from any params object, skipping nullish/empty
 *  values. Generic so typed param interfaces don't need an index signature. */
export function qs<T extends object>(params?: T): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      sp.set(key, String(value));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/* -------------------------------------------------------------------------- */
/* Agents — contract §3.3                                                      */
/* -------------------------------------------------------------------------- */

export interface UploadedSkill {
  name: string;
  content: string;
}

export interface AgentCreate {
  name: string;
  questionnaire: Record<string, unknown>;
  uploaded_skills?: UploadedSkill[];
  max_rounds?: number;
  is_public?: boolean;
  avatar?: string | null;
}

export interface AgentPatch {
  name?: string;
  persona?: string;
  rules?: AgentRules;
  profile_tags?: string[];
  max_rounds?: number;
  is_public?: boolean;
  avatar?: string | null;
}

export interface AgentListParams {
  q?: string;
  /** Comma-separated tags, AND-matched. */
  tags?: string;
  /** `me` or a user UUID. */
  owner?: string;
  is_public?: boolean;
  limit?: number;
  offset?: number;
}

// Public listing, but personalized when authed: the backend resolves `owner=me`
// and private-agent visibility from the bearer token. We attach it when present
// (default `auth`) so a logged-in user actually sees their own (private) twins;
// anonymous callers still get the public listing.
export function listAgents(params?: AgentListParams): Promise<Page<Agent>> {
  return apiFetch<Page<Agent>>(`/api/agents${qs(params)}`, { method: "GET" });
}

// Public, but the owner must be able to read their own private twin — attach the
// token when present so the backend's owner-visibility check passes.
export function getAgent(id: string): Promise<Agent> {
  return apiFetch<Agent>(`/api/agents/${id}`, { method: "GET" });
}

export function createAgent(body: AgentCreate): Promise<Agent> {
  return apiFetch<Agent>("/api/agents", { method: "POST", body });
}

export function forkAgent(id: string, body?: { name?: string }): Promise<Agent> {
  return apiFetch<Agent>(`/api/agents/${id}/fork`, { method: "POST", body: body ?? {} });
}

export function patchAgent(id: string, body: AgentPatch): Promise<Agent> {
  return apiFetch<Agent>(`/api/agents/${id}`, { method: "PATCH", body });
}

/* -------------------------------------------------------------------------- */
/* Scenarios — contract §3.4                                                   */
/* -------------------------------------------------------------------------- */

export function listScenarios(): Promise<Scenario[]> {
  return apiFetch<Scenario[]>("/api/scenarios", { method: "GET", auth: false });
}

export function getScenario(idOrKey: string): Promise<Scenario> {
  return apiFetch<Scenario>(`/api/scenarios/${idOrKey}`, { method: "GET", auth: false });
}

/* -------------------------------------------------------------------------- */
/* Dispatches — contract §3.5                                                  */
/* -------------------------------------------------------------------------- */

export interface DispatchCreate {
  agent_id: string;
  scenario_id: string;
  task_prompt: string;
  opponent_agent_id?: string | null;
  match_by_profile?: boolean;
}

export interface DispatchListParams {
  status?: DispatchStatus;
  agent_id?: string;
  limit?: number;
  offset?: number;
}

export function createDispatch(body: DispatchCreate): Promise<Dispatch> {
  return apiFetch<Dispatch>("/api/dispatches", { method: "POST", body });
}

export function listDispatches(params?: DispatchListParams): Promise<Page<Dispatch>> {
  return apiFetch<Page<Dispatch>>(`/api/dispatches${qs(params)}`, { method: "GET" });
}

export function getDispatch(id: string): Promise<Dispatch> {
  return apiFetch<Dispatch>(`/api/dispatches/${id}`, { method: "GET" });
}

/* -------------------------------------------------------------------------- */
/* Conversations — contract §3.6                                               */
/* -------------------------------------------------------------------------- */

export interface ConversationListParams {
  scenario_id?: string;
  agent_id?: string;
  status?: ConversationStatus;
  limit?: number;
  offset?: number;
}

export function listConversations(params?: ConversationListParams): Promise<Page<Conversation>> {
  return apiFetch<Page<Conversation>>(`/api/conversations${qs(params)}`, {
    method: "GET",
    auth: false,
  });
}

export function getConversation(id: string): Promise<Conversation> {
  return apiFetch<Conversation>(`/api/conversations/${id}`, { method: "GET", auth: false });
}

export function getMessages(
  id: string,
  params?: { after_seq?: number; limit?: number },
): Promise<Message[]> {
  return apiFetch<Message[]>(`/api/conversations/${id}/messages${qs(params)}`, {
    method: "GET",
    auth: false,
  });
}

/* -------------------------------------------------------------------------- */
/* Reports — contract §3.7                                                     */
/* -------------------------------------------------------------------------- */

export function getConversationReport(conversationId: string): Promise<Report> {
  return apiFetch<Report>(`/api/conversations/${conversationId}/report`, {
    method: "GET",
    auth: false,
  });
}

export function getReport(reportId: string): Promise<Report> {
  return apiFetch<Report>(`/api/reports/${reportId}`, { method: "GET", auth: false });
}

/* -------------------------------------------------------------------------- */
/* Evolutions — contract §3.8                                                  */
/* -------------------------------------------------------------------------- */

export function listEvolutions(agentId: string): Promise<Evolution[]> {
  return apiFetch<Evolution[]>(`/api/evolutions${qs({ agent_id: agentId })}`, { method: "GET" });
}

export function applyEvolution(id: string, applied: boolean): Promise<Evolution> {
  return apiFetch<Evolution>(`/api/evolutions/${id}/apply`, {
    method: "POST",
    body: { applied },
  });
}

/* -------------------------------------------------------------------------- */
/* Marketplace — contract §3.9                                                 */
/* -------------------------------------------------------------------------- */

export interface MarketplaceListParams {
  kind?: MarketplaceKind;
  q?: string;
  sort?: "downloads" | "recent";
  limit?: number;
  offset?: number;
}

export interface MarketplaceCreate {
  kind: MarketplaceKind;
  ref_id: string;
  title: string;
  description?: string | null;
  price_points?: number;
}

export interface MarketplaceForkResult {
  item: MarketplaceItem;
  agent: Agent | null;
  skill: Skill | null;
}

export interface PointsBalance {
  user_id: string;
  points: number;
}

export function listMarketplace(params?: MarketplaceListParams): Promise<Page<MarketplaceItem>> {
  return apiFetch<Page<MarketplaceItem>>(`/api/marketplace${qs(params)}`, {
    method: "GET",
    auth: false,
  });
}

export function createMarketplaceItem(body: MarketplaceCreate): Promise<MarketplaceItem> {
  return apiFetch<MarketplaceItem>("/api/marketplace", { method: "POST", body });
}

export function forkMarketplaceItem(id: string): Promise<MarketplaceForkResult> {
  return apiFetch<MarketplaceForkResult>(`/api/marketplace/${id}/fork`, { method: "POST" });
}

export function getPoints(): Promise<PointsBalance> {
  return apiFetch<PointsBalance>("/api/marketplace/points", { method: "GET" });
}
