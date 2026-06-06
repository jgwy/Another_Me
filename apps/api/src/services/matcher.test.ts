import { describe, expect, it } from 'vitest';
import { matchAgents } from './matcher';

const baseAgent = {
  id: 'a',
  name: 'Founder Agent',
  ownerLabel: 'Demo',
  category: 'Startup',
  persona: 'Builds startup pitches and product strategy.',
  skills: ['pitching', 'product strategy'],
  rules: ['Be concise'],
  modelConfig: {},
  maxRounds: 6,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const scenario = {
  id: 's',
  slug: 'exchange',
  name: 'Exchange',
  description: 'Investment and business evaluation.',
  prompt: 'Discuss market and business model.',
  closingPrompt: 'Summarize next diligence steps.',
  suggestedTopics: ['Evaluate startup idea'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('matchAgents', () => {
  it('returns an explainable score and round cap', () => {
    const result = matchAgents(
      baseAgent,
      { ...baseAgent, id: 'b', name: 'VC Agent', category: 'Investment', skills: ['venture capital'] },
      scenario,
      'Evaluate a startup pitch and investment market',
      6,
    );

    expect(result.score).toBeGreaterThan(40);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.recommendedMaxRounds).toBe(6);
  });
});
