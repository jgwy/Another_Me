/**
 * React Query hooks for every feature surface, each with a graceful fallback to
 * the in-memory {@link mockStore} when the live endpoint is still `501`.
 *
 * Components never see an error state during the parallel build window — they
 * render real data where the backend is ready and typed mocks where it is not.
 * For Tier-3 integration, the `orMock` wrappers are the only thing to remove.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";

import {
  applyEvolution,
  connectMcp,
  createAgent,
  createDispatch,
  createMarketplaceItem,
  createMcp,
  createScenario,
  createSkill,
  deleteMcp,
  deleteSkill,
  emptyPromptConfig,
  forkAgent,
  forkMarketplaceItem,
  generateAgent,
  getAgent,
  getConversation,
  getConversationReport,
  getDispatch,
  getMessages,
  getPoints,
  getRelationshipGraph,
  getReport,
  getScenario,
  getSkill,
  getUnreadCount,
  importSkill,
  likeMarketplaceItem,
  listAgents,
  listConversations,
  listDispatches,
  listEvolutions,
  listInbox,
  listMarketplace,
  listMarketplaceVersions,
  listMcps,
  listRelationships,
  listScenarios,
  listSkills,
  markAllNotificationsRead,
  markNotificationRead,
  patchAgent,
  patchSkill,
  publishMarketplaceItem,
  runSandbox,
} from "./api";
import type {
  Agent,
  AgentCreate,
  AgentGenerateRequest,
  AgentGenerateResponse,
  AgentListParams,
  AgentPatch,
  Conversation,
  ConversationListParams,
  Dispatch,
  DispatchCreate,
  DispatchListParams,
  Evolution,
  ImportSkillOptions,
  InboxListParams,
  MarketplaceCreate,
  MarketplaceForkResult,
  MarketplaceItem,
  MarketplaceLikeResult,
  MarketplaceListParams,
  MarketplacePublishBody,
  MarketplaceVersion,
  McpConnectResult,
  McpListParams,
  McpServer,
  McpServerCreate,
  Message,
  Notification,
  Page,
  PointsBalance,
  Relationship,
  RelationshipGraph,
  RelationshipListParams,
  Report,
  SandboxRunRequest,
  SandboxRunResult,
  Scenario,
  ScenarioCreate,
  Skill,
  SkillCreate,
  SkillListParams,
  SkillPatch,
} from "./api";
import { fabricateAgent, mockStore, pickAvatar } from "./mocks";

/* -------------------------------------------------------------------------- */
/* Demo-mode signal (flips when any fallback fires)                            */
/* -------------------------------------------------------------------------- */

interface DemoState {
  demo: boolean;
  markDemo: () => void;
}

export const useDemoStore = create<DemoState>((set) => ({
  demo: false,
  markDemo: () => set((s) => (s.demo ? s : { demo: true })),
}));

/** Run a live request; on any failure, fall back to mock data and flag demo. */
async function orMock<T>(promise: Promise<T>, fallback: () => T): Promise<T> {
  try {
    return await promise;
  } catch {
    useDemoStore.getState().markDemo();
    return fallback();
  }
}

export function useDemoMode(): boolean {
  return useDemoStore((s) => s.demo);
}

/* -------------------------------------------------------------------------- */
/* Query keys                                                                  */
/* -------------------------------------------------------------------------- */

export const qk = {
  scenarios: ["scenarios"] as const,
  scenario: (k: string) => ["scenario", k] as const,
  agents: (params?: AgentListParams) => ["agents", params ?? {}] as const,
  agent: (id: string) => ["agent", id] as const,
  conversations: (params?: ConversationListParams) => ["conversations", params ?? {}] as const,
  conversation: (id: string) => ["conversation", id] as const,
  messages: (id: string) => ["messages", id] as const,
  dispatches: (params?: DispatchListParams) => ["dispatches", params ?? {}] as const,
  dispatch: (id: string) => ["dispatch", id] as const,
  evolutions: (agentId: string) => ["evolutions", agentId] as const,
  reportByConversation: (id: string) => ["report-by-conversation", id] as const,
  report: (id: string) => ["report", id] as const,
  marketplace: (params?: MarketplaceListParams) => ["marketplace", params ?? {}] as const,
  marketplaceVersions: (id: string) => ["marketplace-versions", id] as const,
  points: ["points"] as const,
  skills: (params?: SkillListParams) => ["skills", params ?? {}] as const,
  skill: (id: string) => ["skill", id] as const,
  mcps: (params?: McpListParams) => ["mcps", params ?? {}] as const,
  mcp: (id: string) => ["mcp", id] as const,
  inbox: (params?: InboxListParams) => ["inbox", params ?? {}] as const,
  unreadCount: ["inbox-unread-count"] as const,
  relationships: (params?: RelationshipListParams) => ["relationships", params ?? {}] as const,
  relationshipGraph: (agentId?: string) => ["relationship-graph", agentId ?? "all"] as const,
};

/* -------------------------------------------------------------------------- */
/* Scenarios                                                                   */
/* -------------------------------------------------------------------------- */

export function useScenarios() {
  return useQuery<Scenario[]>({
    queryKey: qk.scenarios,
    queryFn: () => orMock(listScenarios(), () => mockStore.listScenarios()),
    staleTime: 5 * 60_000,
  });
}

export function useScenario(idOrKey: string | undefined) {
  return useQuery<Scenario | undefined>({
    queryKey: qk.scenario(idOrKey ?? ""),
    enabled: !!idOrKey,
    queryFn: () => orMock(getScenario(idOrKey!), () => mockStore.getScenario(idOrKey!)),
    staleTime: 5 * 60_000,
  });
}

/** Create a user-owned scenario (`POST /api/scenarios`); falls back to a typed
 *  mock + demo pill until the call succeeds against a live backend. */
export function useCreateScenario() {
  const qc = useQueryClient();
  return useMutation<Scenario, Error, ScenarioCreate>({
    mutationFn: (body) => orMock(createScenario(body), () => mockStore.createScenario(body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scenarios"] }),
  });
}

/* -------------------------------------------------------------------------- */
/* Agents                                                                      */
/* -------------------------------------------------------------------------- */

export function useAgents(params?: AgentListParams) {
  return useQuery<Page<Agent>>({
    queryKey: qk.agents(params),
    queryFn: () => orMock(listAgents(params), () => mockStore.listAgents(params)),
  });
}

export function useAgent(id: string | undefined) {
  return useQuery<Agent | undefined>({
    queryKey: qk.agent(id ?? ""),
    enabled: !!id,
    queryFn: () => orMock(getAgent(id!), () => mockStore.getAgent(id!)),
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation<Agent, Error, AgentCreate>({
    mutationFn: (input) => orMock(createAgent(input), () => mockStore.addAgent(fabricateAgent(input))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

export function usePatchAgent(id: string) {
  const qc = useQueryClient();
  return useMutation<Agent | undefined, Error, AgentPatch>({
    mutationFn: (body) => orMock(patchAgent(id, body), () => mockStore.updateAgent(id, body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: qk.agent(id) });
    },
  });
}

export function useForkAgent() {
  const qc = useQueryClient();
  return useMutation<Agent, Error, { id: string; name?: string }>({
    mutationFn: ({ id, name }) =>
      orMock(forkAgent(id, name ? { name } : undefined), () => {
        const src = mockStore.getAgent(id);
        if (!src) throw new Error("agent not found");
        const fork: Agent = {
          ...JSON.parse(JSON.stringify(src)),
          id: crypto.randomUUID(),
          name: name ?? `${src.name} (fork)`,
          owner_id: mockStore.getPoints().user_id,
          forked_from: src.id,
          is_public: false,
          avatar: src.avatar ?? pickAvatar(src.name),
        };
        return mockStore.addAgent(fork);
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

/* -------------------------------------------------------------------------- */
/* Conversations + messages                                                    */
/* -------------------------------------------------------------------------- */

export function useConversations(params?: ConversationListParams) {
  return useQuery<Page<Conversation>>({
    queryKey: qk.conversations(params),
    queryFn: () => orMock(listConversations(params), () => mockStore.listConversations(params)),
  });
}

export function useConversation(id: string | undefined) {
  return useQuery<Conversation | undefined>({
    queryKey: qk.conversation(id ?? ""),
    enabled: !!id,
    queryFn: () => orMock(getConversation(id!), () => mockStore.getConversation(id!)),
  });
}

export function useMessages(id: string | undefined) {
  return useQuery<Message[]>({
    queryKey: qk.messages(id ?? ""),
    enabled: !!id,
    queryFn: () => orMock(getMessages(id!), () => mockStore.getMessages(id!)),
  });
}

/* -------------------------------------------------------------------------- */
/* Dispatches                                                                  */
/* -------------------------------------------------------------------------- */

export function useDispatches(params?: DispatchListParams) {
  return useQuery<Page<Dispatch>>({
    queryKey: qk.dispatches(params),
    queryFn: () => orMock(listDispatches(params), () => mockStore.listDispatches(params)),
  });
}

export function useDispatch(id: string | undefined) {
  return useQuery<Dispatch | undefined>({
    queryKey: qk.dispatch(id ?? ""),
    enabled: !!id,
    queryFn: () => orMock(getDispatch(id!), () => mockStore.getDispatch(id!)),
  });
}

export function useCreateDispatch() {
  const qc = useQueryClient();
  return useMutation<Dispatch, Error, DispatchCreate>({
    mutationFn: (input) => orMock(createDispatch(input), () => mockStore.createDispatch(input)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dispatches"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Evolutions                                                                  */
/* -------------------------------------------------------------------------- */

export function useEvolutions(agentId: string | undefined) {
  return useQuery<Evolution[]>({
    queryKey: qk.evolutions(agentId ?? ""),
    enabled: !!agentId,
    queryFn: () => orMock(listEvolutions(agentId!), () => mockStore.listEvolutions(agentId!)),
  });
}

export function useApplyEvolution(agentId: string) {
  const qc = useQueryClient();
  return useMutation<Evolution | undefined, Error, { id: string; applied: boolean }>({
    mutationFn: ({ id, applied }) =>
      orMock(applyEvolution(id, applied), () => mockStore.applyEvolution(id, applied)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.evolutions(agentId) });
      qc.invalidateQueries({ queryKey: qk.agent(agentId) });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Reports                                                                     */
/* -------------------------------------------------------------------------- */

export function useReportByConversation(conversationId: string | undefined) {
  return useQuery<Report | undefined>({
    queryKey: qk.reportByConversation(conversationId ?? ""),
    enabled: !!conversationId,
    queryFn: () =>
      orMock(getConversationReport(conversationId!), () =>
        mockStore.getReportByConversation(conversationId!),
      ),
  });
}

export function useReport(reportId: string | undefined) {
  return useQuery<Report | undefined>({
    queryKey: qk.report(reportId ?? ""),
    enabled: !!reportId,
    queryFn: () => orMock(getReport(reportId!), () => mockStore.getReport(reportId!)),
  });
}

/* -------------------------------------------------------------------------- */
/* Marketplace                                                                 */
/* -------------------------------------------------------------------------- */

export function useMarketplace(params?: MarketplaceListParams) {
  return useQuery<Page<MarketplaceItem>>({
    queryKey: qk.marketplace(params),
    queryFn: () => orMock(listMarketplace(params), () => mockStore.listMarketplace(params)),
  });
}

export function usePoints() {
  return useQuery<PointsBalance>({
    queryKey: qk.points,
    queryFn: () => orMock(getPoints(), () => mockStore.getPoints()),
  });
}

export function useCreateMarketplaceItem() {
  const qc = useQueryClient();
  return useMutation<MarketplaceItem, Error, MarketplaceCreate>({
    mutationFn: (input) =>
      orMock(createMarketplaceItem(input), () => mockStore.addMarketplaceItem(input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketplace"] }),
  });
}

export function useForkMarketplaceItem() {
  const qc = useQueryClient();
  return useMutation<MarketplaceForkResult, Error, string>({
    mutationFn: (id) => orMock(forkMarketplaceItem(id), () => mockStore.forkMarketplaceItem(id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketplace"] });
      qc.invalidateQueries({ queryKey: qk.points });
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

/** v2: toggle like on a listing (optimistic invalidation of the listing pages). */
export function useLikeMarketplaceItem() {
  const qc = useQueryClient();
  return useMutation<MarketplaceLikeResult, Error, string>({
    mutationFn: (id) => orMock(likeMarketplaceItem(id), () => mockStore.likeMarketplaceItem(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketplace"] }),
  });
}

export function useMarketplaceVersions(id: string | undefined) {
  return useQuery<MarketplaceVersion[]>({
    queryKey: qk.marketplaceVersions(id ?? ""),
    enabled: !!id,
    queryFn: () =>
      orMock(listMarketplaceVersions(id!), () => mockStore.listMarketplaceVersions(id!)),
  });
}

export function usePublishMarketplaceItem() {
  const qc = useQueryClient();
  return useMutation<MarketplaceItem, Error, { id: string; body?: MarketplacePublishBody }>({
    mutationFn: ({ id, body }) =>
      orMock(publishMarketplaceItem(id, body), () => mockStore.publishMarketplaceItem(id, body)),
    onSuccess: (_item, { id }) => {
      qc.invalidateQueries({ queryKey: ["marketplace"] });
      qc.invalidateQueries({ queryKey: qk.marketplaceVersions(id) });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Agent generation (NL / corpus → prompt_config draft)                        */
/* -------------------------------------------------------------------------- */

/** Typed-mock generator so the create flow works before the endpoint lands. */
function fabricateGenerate(req: AgentGenerateRequest): AgentGenerateResponse {
  const input = req.input.trim();
  const firstSentence = input.split(/[。.!?！？\n]/)[0]?.trim() || input.slice(0, 60);
  const name = req.name?.trim() || (req.mode === "nl" ? "新的分身" : "语料分身");
  const cfg = emptyPromptConfig(name);
  cfg.identity.one_liner = firstSentence;
  cfg.identity.background = input.slice(0, 600);
  cfg.voice.tone = req.mode === "corpus" ? "贴近语料的真实口吻" : "自然、真诚";
  // Naive keyword extraction for plausible tags.
  const words = Array.from(new Set(input.split(/[\s,，、。.!?！？]+/).filter((w) => w.length >= 2)));
  const tags = words.slice(0, 5);
  cfg.interests.passions = words.slice(0, 3);
  return {
    name,
    prompt_config: cfg,
    persona: firstSentence,
    rules: { tone: cfg.voice.tone, dos: [], donts: [] },
    profile_tags: tags,
    skills: [],
    questions:
      req.mode === "nl"
        ? ["TA 最在意的一两件事是什么？", "TA 说话时有什么口头禅或语气？", "有没有一个最能代表 TA 的小故事？"]
        : ["这段语料里，哪些是 TA 最典型的表达？", "有没有需要刻意避免的话题？"],
  };
}

export function useGenerateAgent() {
  return useMutation<AgentGenerateResponse, Error, AgentGenerateRequest>({
    mutationFn: (req) => orMock(generateAgent(req), () => fabricateGenerate(req)),
  });
}

/* -------------------------------------------------------------------------- */
/* Skills (standalone v2)                                                      */
/* -------------------------------------------------------------------------- */

export function useSkills(params?: SkillListParams) {
  return useQuery<Page<Skill>>({
    queryKey: qk.skills(params),
    queryFn: () => orMock(listSkills(params), () => mockStore.listSkills(params)),
  });
}

export function useSkill(id: string | undefined) {
  return useQuery<Skill | undefined>({
    queryKey: qk.skill(id ?? ""),
    enabled: !!id,
    queryFn: () => orMock(getSkill(id!), () => mockStore.getSkill(id!)),
  });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation<Skill, Error, SkillCreate>({
    mutationFn: (body) => orMock(createSkill(body), () => mockStore.createSkill(body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export function usePatchSkill() {
  const qc = useQueryClient();
  return useMutation<Skill | undefined, Error, { id: string; body: SkillPatch }>({
    mutationFn: ({ id, body }) => orMock(patchSkill(id, body), () => mockStore.patchSkill(id, body)),
    onSuccess: (_s, { id }) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: qk.skill(id) });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) =>
      orMock(deleteSkill(id), () => {
        mockStore.deleteSkill(id);
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

/** Import a skill from a `.zip` pack (multipart). On success the new library
 *  skill lands in the `skills` lists; falls back to a typed mock + demo pill. */
export function useImportSkill() {
  const qc = useQueryClient();
  return useMutation<Skill, Error, { file: File } & ImportSkillOptions>({
    mutationFn: ({ file, ...opts }) =>
      orMock(importSkill(file, opts), () => mockStore.importSkill(file, opts)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

/* -------------------------------------------------------------------------- */
/* MCP servers (sandbox-connected tool servers)                                */
/* -------------------------------------------------------------------------- */

export function useMcps(params?: McpListParams) {
  return useQuery<Page<McpServer>>({
    queryKey: qk.mcps(params),
    queryFn: () => orMock(listMcps(params), () => mockStore.listMcps(params)),
  });
}

export function useCreateMcp() {
  const qc = useQueryClient();
  return useMutation<McpServer, Error, McpServerCreate>({
    mutationFn: (body) => orMock(createMcp(body), () => mockStore.createMcp(body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcps"] }),
  });
}

/** Probe/connect a server inside the sandbox to discover its tools. */
export function useConnectMcp() {
  const qc = useQueryClient();
  return useMutation<McpConnectResult, Error, string>({
    mutationFn: (id) => orMock(connectMcp(id), () => mockStore.connectMcp(id)),
    onSuccess: (_result, id) => {
      qc.invalidateQueries({ queryKey: ["mcps"] });
      qc.invalidateQueries({ queryKey: qk.mcp(id) });
    },
  });
}

export function useDeleteMcp() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) =>
      orMock(deleteMcp(id), () => {
        mockStore.deleteMcp(id);
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcps"] }),
  });
}

/* -------------------------------------------------------------------------- */
/* Inbox / notifications                                                       */
/* -------------------------------------------------------------------------- */

export function useInbox(params?: InboxListParams) {
  return useQuery<Page<Notification>>({
    queryKey: qk.inbox(params),
    queryFn: () => orMock(listInbox(params), () => mockStore.listInbox(params)),
  });
}

/** Drives the nav unread red-dot. Polls modestly so new mail surfaces. */
export function useUnreadCount() {
  return useQuery<{ count: number }>({
    queryKey: qk.unreadCount,
    queryFn: () => orMock(getUnreadCount(), () => mockStore.getUnreadCount()),
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation<Notification | undefined, Error, string>({
    mutationFn: (id) =>
      orMock(markNotificationRead(id), () => mockStore.markNotificationRead(id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox"] });
      qc.invalidateQueries({ queryKey: qk.unreadCount });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation<{ updated: number }, Error, void>({
    mutationFn: () => orMock(markAllNotificationsRead(), () => mockStore.markAllNotificationsRead()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox"] });
      qc.invalidateQueries({ queryKey: qk.unreadCount });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Relationships / graph                                                       */
/* -------------------------------------------------------------------------- */

export function useRelationships(params?: RelationshipListParams) {
  return useQuery<Page<Relationship>>({
    queryKey: qk.relationships(params),
    queryFn: () => orMock(listRelationships(params), () => mockStore.listRelationships(params)),
  });
}

export function useRelationshipGraph(agentId?: string) {
  return useQuery<RelationshipGraph>({
    queryKey: qk.relationshipGraph(agentId),
    queryFn: () => orMock(getRelationshipGraph(agentId), () => mockStore.getRelationshipGraph(agentId)),
  });
}

/* -------------------------------------------------------------------------- */
/* Sandbox run (standalone workspace)                                          */
/* -------------------------------------------------------------------------- */

/**
 * Run code in the sandbox. Targets the backend pass-through and falls back to a
 * typed mock (flipping demo mode) until that route lands — confirm the path at
 * integration. See {@link runSandbox}.
 */
export function useRunSandbox() {
  return useMutation<SandboxRunResult, Error, SandboxRunRequest>({
    mutationFn: (body) => orMock(runSandbox(body), () => mockStore.runSandbox(body)),
  });
}
