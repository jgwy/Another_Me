export type ChatRequest = {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  responseFormat?: 'text' | 'json';
};

export type ChatProvider = {
  name: string;
  complete(request: ChatRequest): Promise<string>;
};
