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
  createAgent,
  createDispatch,
  createMarketplaceItem,
  forkAgent,
  forkMarketplaceItem,
  getAgent,
  getConversation,
  getConversationReport,
  getDispatch,
  getMessages,
  getPoints,
  getReport,
  getScenario,
  listAgents,
  listConversations,
  listDispatches,
  listEvolutions,
  listMarketplace,
  listScenarios,
  patchAgent,
} from "./api";
import type {
  Agent,
  AgentCreate,
  AgentListParams,
  AgentPatch,
  Conversation,
  ConversationListParams,
  Dispatch,
  DispatchCreate,
  DispatchListParams,
  Evolution,
  MarketplaceCreate,
  MarketplaceForkResult,
  MarketplaceItem,
  MarketplaceListParams,
  Message,
  Page,
  PointsBalance,
  Report,
  Scenario,
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
  points: ["points"] as const,
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
    },
  });
}
