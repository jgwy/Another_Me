import type { FastifyInstance } from 'fastify';
import { autonomousSocialRunRequestSchema, socialRunRequestSchema } from '@another-me/shared';
import { getProvider } from '../llm/provider';
import { prisma } from '../prisma';
import { planAutonomousSocialRun, shapeSocialReport } from '../services/autonomousSocial';
import { runConversation } from '../services/conversation';
import { matchAgents } from '../services/matcher';

export const registerSocialRoutes = async (app: FastifyInstance) => {
  app.get('/health', async () => ({ ok: true, provider: getProvider().name }));

  app.get('/agents', async () => prisma.agent.findMany({ orderBy: { name: 'asc' } }));

  app.get('/scenarios', async () => prisma.scenario.findMany({ orderBy: { name: 'asc' } }));

  app.post('/matches', async (request, reply) => {
    const body = socialRunRequestSchema.parse(request.body);
    if (body.agentAId === body.agentBId) {
      return reply.code(400).send({ error: '请选择两个不同的 Agent。', code: 'SAME_AGENT' });
    }

    const [agentA, agentB, scenario] = await Promise.all([
      prisma.agent.findUnique({ where: { id: body.agentAId } }),
      prisma.agent.findUnique({ where: { id: body.agentBId } }),
      prisma.scenario.findUnique({ where: { id: body.scenarioId } }),
    ]);

    if (!agentA || !agentB || !scenario) {
      return reply.code(404).send({ error: '没有找到对应的 Agent 或 Scenario。', code: 'NOT_FOUND' });
    }

    return matchAgents(agentA, agentB, scenario, body.topic, body.maxRounds);
  });

  app.post('/conversations', async (request, reply) => {
    try {
      const body = socialRunRequestSchema.parse(request.body);
      return await runConversation(body, getProvider());
    } catch (error) {
      const message = error instanceof Error ? error.message : '对话运行失败。';
      return reply.code(400).send({ error: message, code: 'CONVERSATION_FAILED' });
    }
  });

  app.post('/autonomous-runs', async (request, reply) => {
    try {
      const body = autonomousSocialRunRequestSchema.parse(request.body);
      const [agents, scenarios] = await Promise.all([
        prisma.agent.findMany({ orderBy: { name: 'asc' } }),
        prisma.scenario.findMany({ orderBy: { name: 'asc' } }),
      ]);
      const plan = planAutonomousSocialRun({
        sourceAgentId: body.sourceAgentId,
        goal: body.goal,
        preferredScenarioSlug: body.preferredScenarioSlug,
        maxRounds: body.maxRounds,
        agents,
        scenarios,
      });
      const conversation = await runConversation({
        agentAId: plan.sourceAgent.id,
        agentBId: plan.targetAgent.id,
        scenarioId: plan.scenario.id,
        topic: plan.topic,
        maxRounds: plan.maxRounds,
      }, getProvider());
      const structuredReport = shapeSocialReport({
        sourceAgentName: plan.sourceAgent.name,
        targetAgentName: plan.targetAgent.name,
        scenarioName: plan.scenario.name,
        matchScore: conversation.report.matchScore,
        summary: conversation.report.summary,
        sharedInterests: conversation.report.sharedInterests,
        tensions: conversation.report.tensions,
        suggestedNextSteps: conversation.report.suggestedNextSteps,
      });
      const existingRaw = typeof conversation.report.raw === 'object' && conversation.report.raw !== null
        ? conversation.report.raw as Record<string, unknown>
        : {};
      const report = await prisma.conversationReport.update({
        where: { id: conversation.report.id },
        data: {
          raw: {
            ...existingRaw,
            structuredSocialReport: structuredReport,
            autonomousPlan: {
              sourceAgentId: plan.sourceAgent.id,
              targetAgentId: plan.targetAgent.id,
              scenarioId: plan.scenario.id,
              reasons: plan.reasons,
              risks: plan.risks,
              playbackSteps: plan.playbackSteps,
            },
          },
        },
      });

      return {
        plan,
        conversation: { ...conversation, report },
        structuredReport,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '自主社交运行失败。';
      return reply.code(400).send({ error: message, code: 'AUTONOMOUS_RUN_FAILED' });
    }
  });

  app.get('/conversations', async () => prisma.conversationRun.findMany({
    orderBy: { createdAt: 'desc' },
    include: { agentA: true, agentB: true, scenario: true, report: true },
    take: 25,
  }));

  app.get('/conversations/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const run = await prisma.conversationRun.findUnique({
      where: { id },
      include: {
        agentA: true,
        agentB: true,
        scenario: true,
        report: true,
        messages: { orderBy: { turnIndex: 'asc' }, include: { speakerAgent: true } },
      },
    });

    if (!run) {
      return reply.code(404).send({ error: '没有找到这条对话记录。', code: 'NOT_FOUND' });
    }

    return run;
  });
};
