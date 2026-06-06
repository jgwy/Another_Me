import type { SocialRunRequest } from '@another-me/shared';
import { env } from '../env';
import type {
  Agent,
  ConversationMessage,
  ConversationReport,
  ConversationRun,
  Scenario,
} from '../generated/prisma/client';
import type { ChatProvider } from '../llm/types';
import { prisma } from '../prisma';
import { matchAgents } from './matcher';

const speakerSystem = (agent: Agent, scenario: Scenario, closing: boolean) => [
  scenario.prompt,
  closing ? scenario.closingPrompt : '',
  `You are ${agent.name}. Persona: ${agent.persona}`,
  `Skills: ${agent.skills.join(', ')}`,
  `Rules: ${agent.rules.join('; ')}`,
].filter(Boolean).join('\n\n');

const transcriptFor = (messages: Array<{ speakerName: string; content: string }>) =>
  messages.map((message) => `${message.speakerName}: ${message.content}`).join('\n');

const parseReport = (raw: string) => {
  try {
    return JSON.parse(raw) as {
      summary?: string;
      sharedInterests?: string[];
      tensions?: string[];
      suggestedNextSteps?: string[];
      reusablePrompt?: string;
    };
  } catch {
    return {
      summary: raw,
      sharedInterests: [],
      tensions: [],
      suggestedNextSteps: [],
      reusablePrompt: '',
    };
  }
};

export const runConversation = async (
  request: SocialRunRequest,
  provider: ChatProvider,
): Promise<{
  run: ConversationRun;
  messages: Array<ConversationMessage & { speakerAgent: Agent }>;
  report: ConversationReport;
}> => {
  if (request.agentAId === request.agentBId) {
    throw new Error('Choose two different agents.');
  }

  const [agentA, agentB, scenario] = await Promise.all([
    prisma.agent.findUnique({ where: { id: request.agentAId } }),
    prisma.agent.findUnique({ where: { id: request.agentBId } }),
    prisma.scenario.findUnique({ where: { id: request.scenarioId } }),
  ]);

  if (!agentA || !agentB || !scenario) {
    throw new Error('Agent or scenario not found.');
  }

  const match = matchAgents(agentA, agentB, scenario, request.topic, request.maxRounds);
  const effectiveMaxRounds = Math.min(match.recommendedMaxRounds, env.MAX_CONVERSATION_ROUNDS);
  const run = await prisma.conversationRun.create({
    data: {
      topic: request.topic,
      requestedMaxRounds: request.maxRounds,
      effectiveMaxRounds,
      matchScore: match.score,
      matchReasons: match.reasons,
      matchRisks: match.risks,
      provider: provider.name,
      agentAId: agentA.id,
      agentBId: agentB.id,
      scenarioId: scenario.id,
    },
  });

  const savedMessages: Array<ConversationMessage & { speakerAgent: Agent }> = [];
  for (let turnIndex = 1; turnIndex <= effectiveMaxRounds; turnIndex += 1) {
    const speaker = turnIndex % 2 === 1 ? agentA : agentB;
    const closing = effectiveMaxRounds - turnIndex < 2;
    const transcript = transcriptFor(savedMessages.map((message) => ({
      speakerName: message.speakerAgent.name,
      content: message.content,
    })));
    const content = await provider.complete({
      system: speakerSystem(speaker, scenario, closing),
      messages: [{
        role: 'user',
        content: `Topic: ${request.topic}\n\nConversation so far:\n${transcript || 'No messages yet.'}\n\nSpeak as ${speaker.name}.`,
      }],
    });
    const message = await prisma.conversationMessage.create({
      data: {
        runId: run.id,
        speakerAgentId: speaker.id,
        turnIndex,
        content,
      },
      include: { speakerAgent: true },
    });
    savedMessages.push(message);
  }

  const reportRaw = await provider.complete({
    system: 'Return a concise JSON report for this agent conversation.',
    responseFormat: 'json',
    messages: [{
      role: 'user',
      content: `Topic: ${request.topic}\nMatch score: ${match.score}\nTranscript:\n${transcriptFor(savedMessages.map((message) => ({
        speakerName: message.speakerAgent.name,
        content: message.content,
      })))}`,
    }],
  });
  const parsed = parseReport(reportRaw);

  const report = await prisma.conversationReport.create({
    data: {
      runId: run.id,
      summary: parsed.summary || 'The agents completed a conversation.',
      matchScore: match.score,
      sharedInterests: parsed.sharedInterests || [],
      tensions: parsed.tensions || [],
      suggestedNextSteps: parsed.suggestedNextSteps || [],
      reusablePrompt: parsed.reusablePrompt || `Continue discussing: ${request.topic}`,
      raw: parsed,
    },
  });

  return { run, messages: savedMessages, report };
};
