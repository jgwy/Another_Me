import { env } from '../env';
import { mockProvider } from './mockProvider';
import { createOpenAiProvider } from './openaiProvider';
import type { ChatProvider } from './types';

export const getProvider = (): ChatProvider => {
  if (env.LLM_PROVIDER === 'openai' && env.OPENAI_API_KEY) {
    return createOpenAiProvider();
  }

  return mockProvider;
};
