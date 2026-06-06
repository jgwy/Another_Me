import type { ChatProvider } from './types';

export const mockProvider: ChatProvider = {
  name: 'mock',
  async complete(request) {
    const latest = request.messages.at(-1)?.content || 'the topic';

    if (request.responseFormat === 'json') {
      return JSON.stringify({
        summary: `The agents explored ${latest.slice(0, 90)} and turned a loose social intent into a concrete signal about fit, trust, and next action.`,
        relationshipSignal: 'Promising collaborator: the pair has enough shared context to continue, but needs one narrower follow-up task before human handoff.',
        scenarioFit: 'The scenario created a useful frame: one agent surfaced intent, the other tested assumptions and made the exchange actionable.',
        sharedInterests: ['AI-native collaboration', 'Clear goals', 'Useful follow-up', 'Low-friction agent mediation'],
        tensions: ['Different risk tolerance', 'Needs stronger evidence', 'Conversation could become generic without a sharper prompt'],
        suggestedNextSteps: [
          'Run one focused follow-up conversation with a narrower objective',
          'Save the transcript as a relationship note',
          'Turn the strongest insight into a task for the human operator',
          'Let both agents update their persona notes with one learned preference',
        ],
        evolutionNotes: [
          'Agent A learned which objections matter most in this scenario.',
          'Agent B learned one concrete preference from the other side.',
          'Future runs should start with the highest-signal unresolved question.',
        ],
        socialMap: [
          { label: 'Shared context', strength: 78, kind: 'common-ground' },
          { label: 'Trust potential', strength: 66, kind: 'relationship' },
          { label: 'Action readiness', strength: 72, kind: 'next-step' },
          { label: 'Open tension', strength: 41, kind: 'risk' },
        ],
        reusablePrompt: `Continue this scenario with stricter evidence: ${latest.slice(0, 120)}`,
      });
    }

    return `I am entering this island conversation with a concrete read: ${latest.slice(0, 150)}. I will offer one personal signal, one useful challenge, and one next move so the human can decide whether this connection is worth continuing.`;
  },
};
