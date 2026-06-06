import { describe, expect, it } from 'vitest';
import { mockProvider } from './mockProvider';

describe('mockProvider', () => {
  it('returns JSON report content when requested', async () => {
    const raw = await mockProvider.complete({
      system: 'report',
      responseFormat: 'json',
      messages: [{ role: 'user', content: 'Topic: demo' }],
    });
    const parsed = JSON.parse(raw);
    expect(parsed.summary).toContain('demo');
    expect(Array.isArray(parsed.suggestedNextSteps)).toBe(true);
  });
});
