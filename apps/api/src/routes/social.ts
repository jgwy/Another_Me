import type { FastifyInstance } from 'fastify';
import { socialRunRequestSchema } from '@another-me/shared';
import { getProvider } from '../llm/provider';
import { prisma } from '../prisma';
import { runConversation } from '../services/conversation';
import { matchAgents } from '../services/matcher';

export const registerSocialRoutes = async (app: FastifyInstance) => {
  app.get('/health', async () => ({ ok: true, provider: getProvider().name }));

  app.get('/agents', async () => prisma.agent.findMany({ orderBy: { name: 'asc' } }));

  app.get('/scenarios', async () => prisma.scenario.findMany({ orderBy: { name: 'asc' } }));

  app.post('/matches', async (request, reply) => {
    const body = socialRunRequestSchema.parse(request.body);
    if (body.agentAId === body.agentBId) {
      return reply.code(400).send({ error: 'Choose two different agents.', code: 'SAME_AGENT' });
    }

    const [agentA, agentB, scenario] = await Promise.all([
      prisma.agent.findUnique({ where: { id: body.agentAId } }),
      prisma.agent.findUnique({ where: { id: body.agentBId } }),
      prisma.scenario.findUnique({ where: { id: body.scenarioId } }),
    ]);

    if (!agentA || !agentB || !scenario) {
      return reply.code(404).send({ error: 'Agent or scenario not found.', code: 'NOT_FOUND' });
    }

    return matchAgents(agentA, agentB, scenario, body.topic, body.maxRounds);
  });

  app.post('/conversations', async (request, reply) => {
    try {
      const body = socialRunRequestSchema.parse(request.body);
      return await runConversation(body, getProvider());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Conversation failed.';
      return reply.code(400).send({ error: message, code: 'CONVERSATION_FAILED' });
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
      return reply.code(404).send({ error: 'Conversation not found.', code: 'NOT_FOUND' });
    }

    return run;
  });
};
