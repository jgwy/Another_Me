import OpenAI from 'openai';
import { env } from '../env';
import type { ChatProvider } from './types';

export const createOpenAiProvider = (): ChatProvider => {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  return {
    name: 'openai',
    async complete(request) {
      const response = await client.responses.create({
        model: env.OPENAI_MODEL,
        input: [
          { role: 'system', content: request.system },
          ...request.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
        text: request.responseFormat === 'json'
          ? { format: { type: 'json_object' } }
          : undefined,
      });

      return response.output_text;
    },
  };
};
