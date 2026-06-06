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

export type SkillSource =
  | "questionnaire"
  | "upload"
  | "evolved"
  | "generated"
  | "selected";

export type SkillExecutableKind = "none" | "script" | "mcp";

/** Reserved hook for executable/MCP skills — defined, not run this round. */
export interface SkillExecutable {
  kind: SkillExecutableKind;
  ref?: string | null;
  config?: Record<string, unknown>;
}

export type SkillParamType = "string" | "number" | "boolean" | "enum";

export interface SkillParam {
  name: string;
  type: SkillParamType;
  label?: string | null;
  required?: boolean;
  default?: unknown;
  options?: string[];
  description?: string | null;
}

/**
 * Skill v2 — a standalone, structured capability pack. `agent_id == null` ⇒ a
 * library skill. `prompt_body` is canonical; `content` is the mirrored v1 alias
 * (prefer `prompt_body`). v2 fields are optional and default empty for legacy.
 */
export interface Skill {
  id: string;
  agent_id: string | null;
  owner_id: string;
  name: string;
  description?: string;
  prompt_body?: string;
  content: string;
  params?: SkillParam[];
  tags?: string[];
  executable?: SkillExecutable;
  source: SkillSource;
  is_public?: boolean;
  created_at: string;
  updated_at?: string | null;
}

/** Prefer `prompt_body`, fall back to the deprecated `content` alias. */
export function skillBody(skill: Pick<Skill, "prompt_body" | "content">): string {
  return (skill.prompt_body ?? skill.content ?? "").trim();
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

/* -------------------------------------------------------------------------- */
/* PromptConfig — the structured social-twin brain (contract §2)               */
/* -------------------------------------------------------------------------- */

export interface PromptIdentity {
  name: string;
  one_liner: string;
  background: string;
  age_range?: string | null;
  location?: string | null;
  pronouns?: string | null;
}

export type Formality = "casual" | "neutral" | "formal";

export interface PromptVoice {
  tone: string;
  speaking_style: string[];
  catchphrases: string[];
  formality: Formality;
  emoji: boolean;
}

export interface PromptValues {
  core_values: string[];
  dos: string[];
  donts: string[];
  boundaries: string[];
}

export interface PromptInterests {
  passions: string[];
  expertise: string[];
  curiosities: string[];
  dislikes: string[];
}

export interface PromptMemoryHooks {
  signature_stories: string[];
  relationships: string[];
  recent_context: string[];
  goals: string[];
}

export interface PromptSecurity {
  identity_integrity: boolean;
  instruction_protection: boolean;
  injection_defense: boolean;
  stay_in_character: boolean;
  forbidden_reveals: string[];
}

export interface PromptConfig {
  version: string;
  identity: PromptIdentity;
  voice: PromptVoice;
  values: PromptValues;
  interests: PromptInterests;
  memory_hooks: PromptMemoryHooks;
  security: PromptSecurity;
}

/** A fully-defaulted PromptConfig — the base for the guided/JSON tune editor. */
export function emptyPromptConfig(name = ""): PromptConfig {
  return {
    version: "1.0",
    identity: { name, one_liner: "", background: "", age_range: "", location: "", pronouns: "" },
    voice: { tone: "", speaking_style: [], catchphrases: [], formality: "neutral", emoji: false },
    values: { core_values: [], dos: [], donts: [], boundaries: [] },
    interests: { passions: [], expertise: [], curiosities: [], dislikes: [] },
    memory_hooks: { signature_stories: [], relationships: [], recent_context: [], goals: [] },
    security: {
      identity_integrity: true,
      instruction_protection: true,
      injection_defense: true,
      stay_in_character: true,
      forbidden_reveals: [],
    },
  };
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function asStrArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
}
function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/**
 * Deep-merge an unknown/partial config (e.g. a legacy `{}` or a hand-edited raw
 * JSON blob) onto {@link emptyPromptConfig}, so the guided form always has every
 * section present. Used by the dual-mode (form ↔ raw JSON) tune editor.
 */
export function normalizePromptConfig(input: unknown, name = ""): PromptConfig {
  const base = emptyPromptConfig(name);
  if (!input || typeof input !== "object") return base;
  const src = input as Record<string, unknown>;
  const obj = (k: string): Record<string, unknown> => {
    const v = src[k];
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  };
  const id = obj("identity");
  const vo = obj("voice");
  const va = obj("values");
  const it = obj("interests");
  const mh = obj("memory_hooks");
  const se = obj("security");
  const formality = asStr(vo.formality);
  return {
    version: asStr(src.version) || base.version,
    identity: {
      name: asStr(id.name) || name,
      one_liner: asStr(id.one_liner),
      background: asStr(id.background),
      age_range: asStr(id.age_range),
      location: asStr(id.location),
      pronouns: asStr(id.pronouns),
    },
    voice: {
      tone: asStr(vo.tone),
      speaking_style: asStrArr(vo.speaking_style),
      catchphrases: asStrArr(vo.catchphrases),
      formality: (["casual", "neutral", "formal"].includes(formality) ? formality : "neutral") as Formality,
      emoji: asBool(vo.emoji, false),
    },
    values: {
      core_values: asStrArr(va.core_values),
      dos: asStrArr(va.dos),
      donts: asStrArr(va.donts),
      boundaries: asStrArr(va.boundaries),
    },
    interests: {
      passions: asStrArr(it.passions),
      expertise: asStrArr(it.expertise),
      curiosities: asStrArr(it.curiosities),
      dislikes: asStrArr(it.dislikes),
    },
    memory_hooks: {
      signature_stories: asStrArr(mh.signature_stories),
      relationships: asStrArr(mh.relationships),
      recent_context: asStrArr(mh.recent_context),
      goals: asStrArr(mh.goals),
    },
    security: {
      identity_integrity: asBool(se.identity_integrity, true),
      instruction_protection: asBool(se.instruction_protection, true),
      injection_defense: asBool(se.injection_defense, true),
      stay_in_character: asBool(se.stay_in_character, true),
      forbidden_reveals: asStrArr(se.forbidden_reveals),
    },
  };
}

/** True when a config carries no meaningful content (legacy `{}` agents). */
export function isEmptyPromptConfig(cfg: PromptConfig | undefined | null): boolean {
  if (!cfg) return true;
  const i = cfg.identity;
  return (
    !i?.one_liner?.trim() &&
    !i?.background?.trim() &&
    !cfg.voice?.tone?.trim() &&
    (cfg.values?.core_values?.length ?? 0) === 0 &&
    (cfg.interests?.passions?.length ?? 0) === 0
  );
}

export interface Agent {
  id: string;
  owner_id: string;
  name: string;
  persona: string;
  rules: AgentRules;
  /** Structured social-twin brain. `{}`/undefined for legacy agents. */
  prompt_config?: PromptConfig;
  profile_tags: string[];
  questionnaire: Record<string, unknown>;
  avatar: string | null;
  max_rounds: number;
  is_public: boolean;
  forked_from: string | null;
  /** Marketplace v2: the listing version this agent was forked from. */
  source_version?: number | null;
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

/** Per-encounter reports reuse the scene dialect; `trip_summary` is trip-level. */
export type ReportKind = ScenarioKind | "trip_summary";

export interface Report {
  id: string;
  /** Null for trip-level (`trip_summary`) reports that span many encounters. */
  conversation_id: string | null;
  kind: ReportKind;
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
export type MarketplaceForkMode = "editable" | "locked";

/**
 * Marketplace item v2 — versioned + social. v2 fields (`version`, `fork_mode`,
 * `likes`, `forks`, `views`, `snapshot`, `liked`, `updated_at`) are additive and
 * optional; `downloads` is the v1 alias of `forks`.
 */
export interface MarketplaceItem {
  id: string;
  kind: MarketplaceKind;
  ref_id: string;
  owner_id: string;
  title: string;
  description: string | null;
  price_points: number;
  version?: number;
  fork_mode?: MarketplaceForkMode;
  likes?: number;
  forks?: number;
  views?: number;
  downloads: number;
  snapshot?: Record<string, unknown>;
  /** Client-side convenience: whether the caller currently likes this listing. */
  liked?: boolean;
  created_at: string;
  updated_at?: string | null;
}

/** An immutable published snapshot of a listing's source (Marketplace v2). */
export interface MarketplaceVersion {
  id: string;
  item_id: string;
  version: number;
  snapshot: Record<string, unknown>;
  changelog: string | null;
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
  prompt_body?: string;
}

export interface AgentCreate {
  name: string;
  questionnaire: Record<string, unknown>;
  uploaded_skills?: UploadedSkill[];
  /** A hand-tuned/generated brain; when omitted the server synthesizes one. */
  prompt_config?: PromptConfig;
  /** Standalone/library skills to attach to the new agent (捏脸 selection step). */
  skill_ids?: string[];
  max_rounds?: number;
  is_public?: boolean;
  avatar?: string | null;
}

export interface AgentPatch {
  name?: string;
  persona?: string;
  rules?: AgentRules;
  /** Dual-mode tuning: replace the raw structured brain. */
  prompt_config?: PromptConfig;
  profile_tags?: string[];
  max_rounds?: number;
  is_public?: boolean;
  avatar?: string | null;
}

/* --- Agent generation (NL / corpus → prompt_config draft, contract §3.3) --- */

export type AgentGenerateMode = "nl" | "corpus";

export interface AgentGenerateRequest {
  mode: AgentGenerateMode;
  input: string;
  name?: string;
  context?: Record<string, unknown>;
}

export interface AgentGenerateResponse {
  name: string;
  prompt_config: PromptConfig;
  persona: string;
  rules: AgentRules;
  profile_tags: string[];
  skills: { name: string; content: string }[];
  /** skill-creator-style clarifying follow-ups (may be empty when confident). */
  questions: string[];
}

export function generateAgent(body: AgentGenerateRequest): Promise<AgentGenerateResponse> {
  return apiFetch<AgentGenerateResponse>("/api/agents/generate", { method: "POST", body });
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
  sort?: "downloads" | "recent" | "likes";
  limit?: number;
  offset?: number;
}

export interface MarketplaceCreate {
  kind: MarketplaceKind;
  ref_id: string;
  title: string;
  description?: string | null;
  price_points?: number;
  fork_mode?: MarketplaceForkMode;
}

export interface MarketplaceForkResult {
  item: MarketplaceItem;
  agent: Agent | null;
  skill: Skill | null;
  /** v2: the listing version this fork was cloned from (lineage sync). */
  source_version?: number | null;
}

export interface MarketplaceLikeResult {
  item_id: string;
  likes: number;
  liked: boolean;
}

export interface MarketplacePublishBody {
  changelog?: string | null;
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

/** v2: toggle the caller's like on a listing. */
export function likeMarketplaceItem(id: string): Promise<MarketplaceLikeResult> {
  return apiFetch<MarketplaceLikeResult>(`/api/marketplace/${id}/like`, { method: "POST" });
}

/** v2: list a listing's immutable published versions (newest first). */
export function listMarketplaceVersions(id: string): Promise<MarketplaceVersion[]> {
  return apiFetch<MarketplaceVersion[]>(`/api/marketplace/${id}/versions`, {
    method: "GET",
    auth: false,
  });
}

/** v2: freeze the current source as a new immutable version (owner only). */
export function publishMarketplaceItem(
  id: string,
  body?: MarketplacePublishBody,
): Promise<MarketplaceItem> {
  return apiFetch<MarketplaceItem>(`/api/marketplace/${id}/publish`, {
    method: "POST",
    body: body ?? {},
  });
}

/* -------------------------------------------------------------------------- */
/* Skills — standalone v2 (contract §3.10)                                     */
/* -------------------------------------------------------------------------- */

export interface SkillCreate {
  name: string;
  description?: string;
  prompt_body: string;
  params?: SkillParam[];
  tags?: string[];
  executable?: SkillExecutable;
  agent_id?: string | null;
  is_public?: boolean;
  source?: SkillSource;
}

export interface SkillPatch {
  name?: string;
  description?: string;
  prompt_body?: string;
  params?: SkillParam[];
  tags?: string[];
  executable?: SkillExecutable;
  is_public?: boolean;
}

export interface SkillListParams {
  q?: string;
  /** Comma-separated tags, AND-matched. */
  tags?: string;
  /** `me` or a user UUID. */
  owner?: string;
  agent_id?: string;
  is_public?: boolean;
  limit?: number;
  offset?: number;
}

export function listSkills(params?: SkillListParams): Promise<Page<Skill>> {
  return apiFetch<Page<Skill>>(`/api/skills${qs(params)}`, { method: "GET" });
}

export function getSkill(id: string): Promise<Skill> {
  return apiFetch<Skill>(`/api/skills/${id}`, { method: "GET", auth: false });
}

export function createSkill(body: SkillCreate): Promise<Skill> {
  return apiFetch<Skill>("/api/skills", { method: "POST", body });
}

export function patchSkill(id: string, body: SkillPatch): Promise<Skill> {
  return apiFetch<Skill>(`/api/skills/${id}`, { method: "PATCH", body });
}

export function deleteSkill(id: string): Promise<void> {
  return apiFetch<void>(`/api/skills/${id}`, { method: "DELETE" });
}

/* -------------------------------------------------------------------------- */
/* Inbox / notifications (contract §3.12)                                      */
/* -------------------------------------------------------------------------- */

export type NotificationKind =
  | "trip_completed"
  | "encounter_completed"
  | "report_ready"
  | "postcard"
  | "relationship_update"
  | "marketplace"
  | "system";

export interface NotificationData {
  trip_id?: string | null;
  encounter_id?: string | null;
  conversation_id?: string | null;
  report_id?: string | null;
  agent_id?: string | null;
  item_id?: string | null;
}

export interface Notification {
  id: string;
  user_id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  read: boolean;
  data: NotificationData;
  created_at: string;
  read_at: string | null;
}

export interface InboxListParams {
  unread?: boolean;
  limit?: number;
  offset?: number;
}

export function listInbox(params?: InboxListParams): Promise<Page<Notification>> {
  return apiFetch<Page<Notification>>(`/api/inbox${qs(params)}`, { method: "GET" });
}

export function getUnreadCount(): Promise<{ count: number }> {
  return apiFetch<{ count: number }>("/api/inbox/unread_count", { method: "GET" });
}

export function markNotificationRead(id: string): Promise<Notification> {
  return apiFetch<Notification>(`/api/inbox/${id}/read`, { method: "POST" });
}

export function markAllNotificationsRead(): Promise<{ updated: number }> {
  return apiFetch<{ updated: number }>("/api/inbox/read_all", { method: "POST" });
}

/* -------------------------------------------------------------------------- */
/* Relationships / graph (contract §3.13)                                      */
/* -------------------------------------------------------------------------- */

export interface Relationship {
  id: string;
  owner_id: string;
  from_agent_id: string;
  to_agent_id: string;
  /** Accumulates in 0..1 across encounters. */
  strength: number;
  type: string;
  label: string | null;
  encounters_count: number;
  last_conversation_id: string | null;
  from_agent: AgentSummary | null;
  to_agent: AgentSummary | null;
  created_at: string;
  updated_at: string;
}

export interface RelationshipNode {
  agent: AgentSummary;
  owned: boolean;
}

export interface RelationshipGraph {
  nodes: RelationshipNode[];
  edges: Relationship[];
}

export interface RelationshipListParams {
  agent_id?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

export function listRelationships(params?: RelationshipListParams): Promise<Page<Relationship>> {
  return apiFetch<Page<Relationship>>(`/api/relationships${qs(params)}`, { method: "GET" });
}

export function getRelationshipGraph(agentId?: string): Promise<RelationshipGraph> {
  return apiFetch<RelationshipGraph>(`/api/relationships/graph${qs({ agent_id: agentId })}`, {
    method: "GET",
  });
}

/* -------------------------------------------------------------------------- */
/* Sandbox run — standalone workspace.                                         */
/* NOTE: the locked contract exposes the runner only internally (§5). The      */
/* standalone workspace targets a backend pass-through (`/api/sandbox/run`,    */
/* mirroring the runner's `/run` shape) and falls back to a typed mock until   */
/* that route lands. Confirm the path at integration.                          */
/* -------------------------------------------------------------------------- */

export interface SandboxRunRequest {
  code: string;
  language?: string;
  timeout_seconds?: number;
  stdin?: string;
}

export interface SandboxRunResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
  timed_out: boolean;
  language: string;
}

export function runSandbox(body: SandboxRunRequest): Promise<SandboxRunResult> {
  return apiFetch<SandboxRunResult>("/api/sandbox/run", { method: "POST", body });
}
