import type { MatchResult } from '@another-me/shared';
import type { Agent, Scenario } from '../generated/prisma/client';

const words = (value: string) => {
  const normalized = value.toLowerCase();
  const latinWords = normalized.split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  const chineseChunks = normalized.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const chineseBigrams = chineseChunks.flatMap((chunk) =>
    Array.from({ length: Math.max(0, chunk.length - 1) }, (_, index) => chunk.slice(index, index + 2)),
  );

  return new Set([...latinWords, ...chineseBigrams]);
};

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
      `${agentA.name} 带来「${agentA.category}」语境。`,
      `${agentB.name} 带来「${agentB.category}」语境。`,
      `${scenario.name} 为这次 Agent 社交提供了清晰的场景边界。`,
    ],
    risks: score < 50
      ? ['当前话题还需要更多细节，才能形成高质量交流。']
      : ['如果话题不要求做取舍，两个 Agent 可能会过快达成泛泛共识。'],
    recommendedMaxRounds: Math.min(agentA.maxRounds, agentB.maxRounds, requestedMaxRounds),
  };
};
