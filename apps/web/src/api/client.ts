import type { AutonomousSocialRunRequest, SocialRunRequest } from '@another-me/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const json = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body as T;
};

export const api = {
  health: () => json<{ ok: boolean; provider: string }>('/health'),
  agents: () => json<Agent[]>('/agents'),
  scenarios: () => json<Scenario[]>('/scenarios'),
  match: (body: SocialRunRequest) => json<MatchResult>('/matches', { method: 'POST', body: JSON.stringify(body) }),
  converse: (body: SocialRunRequest) => json<ConversationResult>('/conversations', { method: 'POST', body: JSON.stringify(body) }),
  autonomousRun: (body: AutonomousSocialRunRequest) =>
    json<AutonomousRunResult>('/autonomous-runs', { method: 'POST', body: JSON.stringify(body) }),
  history: () => json<HistoryRun[]>('/conversations'),
  conversation: (id: string) => json<ConversationDetail>(`/conversations/${id}`),
};

export type Agent = {
  id: string;
  name: string;
  ownerLabel: string;
  category: string;
  persona: string;
  skills: string[];
  rules: string[];
  maxRounds: number;
};

export type Scenario = {
  id: string;
  slug: string;
  name: string;
  description: string;
  suggestedTopics: string[];
};

export type MatchResult = {
  score: number;
  reasons: string[];
  risks: string[];
  recommendedMaxRounds: number;
};

export type ConversationMessage = {
  id: string;
  speakerAgentId: string;
  speakerAgent: Agent;
  turnIndex: number;
  content: string;
};

export type ConversationReport = {
  id: string;
  summary: string;
  matchScore: number;
  sharedInterests: string[];
  tensions: string[];
  suggestedNextSteps: string[];
  reusablePrompt: string;
  raw?: Record<string, unknown>;
};

export type PlaybackStep = {
  kind: 'read_profile' | 'choose_scene' | 'move' | 'match' | 'conversation' | 'report';
  title: string;
  detail: string;
};

export type AutonomousPlan = {
  sourceAgent: Agent;
  targetAgent: Agent;
  scenario: Scenario;
  topic: string;
  maxRounds: number;
  score: number;
  reasons: string[];
  risks: string[];
  route: string[];
  mapEvents: Array<{
    type: 'thinking' | 'choose_scene' | 'move' | 'discover' | 'conversation' | 'report';
    label: string;
    sceneSlug?: string;
    agentId?: string;
  }>;
  playbackSteps: PlaybackStep[];
};

export type StructuredSocialReport = {
  relationshipScore: number;
  relationshipType: string;
  summary: string;
  sharedInterests: string[];
  tensions: string[];
  nextHumanActions: string[];
  mapUpdates: Array<{
    from: string;
    to: string;
    strength: number;
    label: string;
  }>;
  agentLearning: string;
};

export type ConversationRun = {
  id: string;
  topic: string;
  matchScore: number;
  matchReasons: string[];
  matchRisks: string[];
  effectiveMaxRounds: number;
};

export type ConversationResult = {
  run: ConversationRun;
  messages: ConversationMessage[];
  report: ConversationReport;
};

export type AutonomousRunResult = {
  plan: AutonomousPlan;
  conversation: ConversationResult;
  structuredReport: StructuredSocialReport;
};

export type ConversationDetail = ConversationRun & {
  agentA: Agent;
  agentB: Agent;
  scenario: Scenario;
  report: ConversationReport;
  messages: ConversationMessage[];
};

export type HistoryRun = ConversationRun & {
  agentA: Agent;
  agentB: Agent;
  scenario: Scenario;
  report?: ConversationReport;
};
