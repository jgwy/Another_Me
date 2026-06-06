import { z } from 'zod';
import {
  DEFAULT_MAX_CONVERSATION_ROUNDS,
  MAX_CONVERSATION_ROUNDS,
  MIN_CONVERSATION_ROUNDS,
} from './constants';

export const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerLabel: z.string(),
  category: z.string(),
  persona: z.string(),
  skills: z.array(z.string()),
  rules: z.array(z.string()),
  maxRounds: z.number().int().min(MIN_CONVERSATION_ROUNDS).max(MAX_CONVERSATION_ROUNDS),
});

export const scenarioSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  prompt: z.string(),
  closingPrompt: z.string(),
  suggestedTopics: z.array(z.string()),
});

export const socialRunRequestSchema = z.object({
  agentAId: z.string().min(1),
  agentBId: z.string().min(1),
  scenarioId: z.string().min(1),
  topic: z.string().trim().min(3).max(500),
  maxRounds: z.coerce
    .number()
    .int()
    .min(MIN_CONVERSATION_ROUNDS)
    .max(MAX_CONVERSATION_ROUNDS)
    .default(DEFAULT_MAX_CONVERSATION_ROUNDS),
});

export const matchResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  reasons: z.array(z.string()),
  risks: z.array(z.string()),
  recommendedMaxRounds: z.number().int(),
});

export const conversationMessageSchema = z.object({
  id: z.string(),
  speakerAgentId: z.string(),
  speakerName: z.string(),
  turnIndex: z.number().int(),
  content: z.string(),
  createdAt: z.string(),
});

export const conversationReportSchema = z.object({
  id: z.string(),
  summary: z.string(),
  matchScore: z.number().int().min(0).max(100),
  sharedInterests: z.array(z.string()),
  tensions: z.array(z.string()),
  suggestedNextSteps: z.array(z.string()),
  reusablePrompt: z.string(),
});

export type AgentDto = z.infer<typeof agentSchema>;
export type ScenarioDto = z.infer<typeof scenarioSchema>;
export type SocialRunRequest = z.infer<typeof socialRunRequestSchema>;
export type MatchResult = z.infer<typeof matchResultSchema>;
export type ConversationMessageDto = z.infer<typeof conversationMessageSchema>;
export type ConversationReportDto = z.infer<typeof conversationReportSchema>;
