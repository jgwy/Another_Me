import type { MatchResult } from '@another-me/shared';
import type { Agent, Scenario } from '../generated/prisma/client';

const words = (value: string) =>
  new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2));

const overlapCount = (left: Set<string>, right: Set<string>) =>
  [...left].filter((word) => right.has(word)).length;

export const matchAgents = (
  agentA: Agent,
  agentB: Agent,
  scenario: Scenario,
  topic: string,
  requestedMaxRounds: number,
): MatchResult => {
  const topicWords = words(topic);
  const scenarioWords = words(`${scenario.name} ${scenario.description} ${scenario.prompt}`);
  const agentAWords = words(`${agentA.category} ${agentA.persona} ${agentA.skills.join(' ')}`);
  const agentBWords = words(`${agentB.category} ${agentB.persona} ${agentB.skills.join(' ')}`);

  const topicAlignment = Math.min(
    30,
    (overlapCount(topicWords, agentAWords) + overlapCount(topicWords, agentBWords)) * 8,
  );
  const scenarioAlignment = Math.min(
    30,
    (overlapCount(scenarioWords, agentAWords) + overlapCount(scenarioWords, agentBWords)) * 5,
  );
  const complementarity = agentA.category === agentB.category ? 12 : 25;
  const roundFit = Math.min(agentA.maxRounds, agentB.maxRounds) >= requestedMaxRounds ? 15 : 8;
  const score = Math.max(20, Math.min(100, topicAlignment + scenarioAlignment + complementarity + roundFit));

  return {
    score,
    reasons: [
      `${agentA.name} brings ${agentA.category.toLowerCase()} context.`,
      `${agentB.name} brings ${agentB.category.toLowerCase()} context.`,
      `${scenario.name} gives the conversation a clear frame.`,
    ],
    risks: score < 50
      ? ['The topic may need more detail for a strong exchange.']
      : ['The agents may converge quickly unless the topic asks for tradeoffs.'],
    recommendedMaxRounds: Math.min(agentA.maxRounds, agentB.maxRounds, requestedMaxRounds),
  };
};
