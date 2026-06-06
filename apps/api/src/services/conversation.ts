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
  `你是 ${agent.name}。Persona：${agent.persona}`,
  `Skills：${agent.skills.join(', ')}`,
  `Rules：${agent.rules.join('; ')}`,
].filter(Boolean).join('\n\n');

const transcriptFor = (messages: Array<{ speakerName: string; content: string }>) =>
  messages.map((message) => `${message.speakerName}: ${message.content}`).join('\n');

const parseReport = (raw: string) => {
  try {
    return JSON.parse(raw) as {
      summary?: string;
      relationshipSignal?: string;
      scenarioFit?: string;
      sharedInterests?: string[];
      tensions?: string[];
      suggestedNextSteps?: string[];
      evolutionNotes?: string[];
      socialMap?: Array<{ label: string; strength: number; kind: string }>;
      reusablePrompt?: string;
    };
  } catch {
    return {
      summary: raw,
      relationshipSignal: '',
      scenarioFit: '',
      sharedInterests: [],
      tensions: [],
      suggestedNextSteps: [],
      evolutionNotes: [],
      socialMap: [],
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
    throw new Error('请选择两个不同的 Agent。');
  }

  const [agentA, agentB, scenario] = await Promise.all([
    prisma.agent.findUnique({ where: { id: request.agentAId } }),
    prisma.agent.findUnique({ where: { id: request.agentBId } }),
    prisma.scenario.findUnique({ where: { id: request.scenarioId } }),
  ]);

  if (!agentA || !agentB || !scenario) {
    throw new Error('没有找到对应的 Agent 或 Scenario。');
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
        content: `话题：${request.topic}\n\n目前对话：\n${transcript || '还没有消息。'}\n\n请以 ${speaker.name} 的身份发言。`,
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
    system: '请为这次 Agent 对话返回一份简洁的 JSON 社交报告。必须包含 summary、relationshipSignal、scenarioFit、sharedInterests、tensions、suggestedNextSteps、evolutionNotes、socialMap、reusablePrompt。所有面向用户的内容请使用中文，保留必要英文产品词即可。',
    responseFormat: 'json',
    messages: [{
      role: 'user',
      content: `话题：${request.topic}\n匹配分数：${match.score}\n对话记录：\n${transcriptFor(savedMessages.map((message) => ({
        speakerName: message.speakerAgent.name,
        content: message.content,
      })))}`,
    }],
  });
  const parsed = parseReport(reportRaw);

  const report = await prisma.conversationReport.create({
    data: {
      runId: run.id,
      summary: parsed.summary || '两个 Agent 已完成一轮对话。',
      matchScore: match.score,
      sharedInterests: parsed.sharedInterests || [],
      tensions: parsed.tensions || [],
      suggestedNextSteps: parsed.suggestedNextSteps || [],
      reusablePrompt: parsed.reusablePrompt || `继续讨论：${request.topic}`,
      raw: parsed,
    },
  });

  return { run, messages: savedMessages, report };
};
