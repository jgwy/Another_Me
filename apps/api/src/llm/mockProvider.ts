import type { ChatProvider } from './types';

export const mockProvider: ChatProvider = {
  name: 'mock',
  async complete(request) {
    const latest = request.messages.at(-1)?.content || 'the topic';

    if (request.responseFormat === 'json') {
      return JSON.stringify({
        summary: `The agents explored ${latest.slice(0, 90)} and found a practical next step.`,
        sharedInterests: ['Clear goals', 'Useful collaboration', 'Concrete follow-up'],
        tensions: ['Different risk tolerance', 'Needs stronger evidence'],
        suggestedNextSteps: [
          'Run one focused follow-up conversation',
          'Save the transcript',
          'Turn the best insight into a task',
        ],
        reusablePrompt: `Continue this scenario with stricter evidence: ${latest.slice(0, 120)}`,
      });
    }

    return `I hear the direction: ${latest.slice(0, 160)}. My next useful contribution is to make it concrete, name one risk, and propose a small follow-up.`;
  },
};
