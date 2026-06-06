# Module 3 C-Lite Full-Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent C-lite full-stack app for Another Me module three, using existing seeded agents to run scenario-based matching, multi-round agent dialogue, structured reports, and persistent history.

**Architecture:** Add a TypeScript monorepo beside the existing mirror: `apps/api` for Fastify + Prisma, `apps/web` for Vite + React + TailwindCSS, and `packages/shared` for Zod contracts and shared types. The API uses Postgres through Prisma and selects either a deterministic mock LLM provider or OpenAI at runtime.

**Tech Stack:** pnpm workspaces, TypeScript, Vite, React, TailwindCSS, Fastify, Prisma, Postgres, Zod, Vitest, Docker Compose.

---

## File Structure

- Create `pnpm-workspace.yaml` to define `apps/*` and `packages/*`.
- Modify root `package.json` to keep `npm run mirror` and add workspace scripts.
- Create root `.env.example` for API, web, database, and LLM configuration.
- Create root `docker-compose.yml` for Postgres, API, and web.
- Create root `.dockerignore` for Node build artifacts.
- Create `packages/shared` for request/response schemas and constants.
- Create `apps/api` for Fastify routes, Prisma schema, seed data, matching, conversation, and providers.
- Create `apps/web` for the module three workbench.
- Modify `README.md` with collaboration, setup, and module scope guidance.
- Do not remove or rewrite `scripts/serve-local-mirror.mjs`, `site/`, `modules/`, or `data/`.

### Task 1: Workspace And Root Configuration

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `.env.example`
- Create: `.dockerignore`
- Modify: `package.json`

- [ ] **Step 1: Add pnpm workspaces**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 2: Replace root package metadata and scripts**

Modify `package.json` to:

```json
{
  "name": "another-me",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "mirror": "node scripts/serve-local-mirror.mjs",
    "dev": "pnpm -r --parallel dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "db:generate": "pnpm --filter @another-me/api db:generate",
    "db:migrate": "pnpm --filter @another-me/api db:migrate",
    "db:seed": "pnpm --filter @another-me/api db:seed"
  },
  "packageManager": "pnpm@latest"
}
```

- [ ] **Step 3: Add environment example**

Create `.env.example`:

```text
DATABASE_URL=postgresql://another_me:another_me@localhost:5432/another_me
API_PORT=4000
WEB_PORT=5173
VITE_API_BASE_URL=http://localhost:4000
LLM_PROVIDER=mock
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
MAX_CONVERSATION_ROUNDS=6
```

- [ ] **Step 4: Add Docker ignore file**

Create `.dockerignore`:

```text
node_modules
dist
.turbo
.next
.DS_Store
.env
coverage
apps/api/generated
```

- [ ] **Step 5: Verify root JSON is valid**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json ok')"
```

Expected: prints `package.json ok`.

- [ ] **Step 6: Commit root workspace configuration**

```bash
git add pnpm-workspace.yaml package.json .env.example .dockerignore
git commit -m "chore: add full-stack workspace config"
```

### Task 2: Shared Contracts Package

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/schemas.ts`
- Create: `packages/shared/src/constants.ts`

- [ ] **Step 1: Create shared package manifest**

Create `packages/shared/package.json`:

```json
{
  "name": "@another-me/shared",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "tsc --noEmit",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "zod": "latest"
  },
  "devDependencies": {
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Create `packages/shared/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Add shared constants**

Create `packages/shared/src/constants.ts`:

```ts
export const DEFAULT_MAX_CONVERSATION_ROUNDS = 6;
export const MIN_CONVERSATION_ROUNDS = 2;
export const MAX_CONVERSATION_ROUNDS = 10;
```

- [ ] **Step 4: Add shared Zod schemas**

Create `packages/shared/src/schemas.ts`:

```ts
import { z } from 'zod';
import {
  DEFAULT_MAX_CONVERSATION_ROUNDS,
  MAX_CONVERSATION_ROUNDS,
  MIN_CONVERSATION_ROUNDS,
} from './constants';

export const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerLabel: z.string(),
  category: z.string(),
  persona: z.string(),
  skills: z.array(z.string()),
  rules: z.array(z.string()),
  maxRounds: z.number().int().min(MIN_CONVERSATION_ROUNDS).max(MAX_CONVERSATION_ROUNDS),
});

export const scenarioSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  prompt: z.string(),
  closingPrompt: z.string(),
  suggestedTopics: z.array(z.string()),
});

export const socialRunRequestSchema = z.object({
  agentAId: z.string().min(1),
  agentBId: z.string().min(1),
  scenarioId: z.string().min(1),
  topic: z.string().trim().min(3).max(500),
  maxRounds: z.coerce
    .number()
    .int()
    .min(MIN_CONVERSATION_ROUNDS)
    .max(MAX_CONVERSATION_ROUNDS)
    .default(DEFAULT_MAX_CONVERSATION_ROUNDS),
});

export const matchResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  reasons: z.array(z.string()),
  risks: z.array(z.string()),
  recommendedMaxRounds: z.number().int(),
});

export const conversationMessageSchema = z.object({
  id: z.string(),
  speakerAgentId: z.string(),
  speakerName: z.string(),
  turnIndex: z.number().int(),
  content: z.string(),
  createdAt: z.string(),
});

export const conversationReportSchema = z.object({
  id: z.string(),
  summary: z.string(),
  matchScore: z.number().int().min(0).max(100),
  sharedInterests: z.array(z.string()),
  tensions: z.array(z.string()),
  suggestedNextSteps: z.array(z.string()),
  reusablePrompt: z.string(),
});

export type AgentDto = z.infer<typeof agentSchema>;
export type ScenarioDto = z.infer<typeof scenarioSchema>;
export type SocialRunRequest = z.infer<typeof socialRunRequestSchema>;
export type MatchResult = z.infer<typeof matchResultSchema>;
export type ConversationMessageDto = z.infer<typeof conversationMessageSchema>;
export type ConversationReportDto = z.infer<typeof conversationReportSchema>;
```

- [ ] **Step 5: Export shared modules**

Create `packages/shared/src/index.ts`:

```ts
export * from './constants';
export * from './schemas';
```

- [ ] **Step 6: Run shared typecheck**

Run:

```bash
pnpm --filter @another-me/shared typecheck
```

Expected: exits successfully.

- [ ] **Step 7: Commit shared contracts**

```bash
git add packages/shared
git commit -m "feat: add shared social contracts"
```

### Task 3: API Package, Prisma Schema, And Seed Data

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/seed.ts`
- Create: `apps/api/src/prisma.ts`
- Create: `apps/api/src/env.ts`

- [ ] **Step 1: Create API package manifest**

Create `apps/api/package.json`:

```json
{
  "name": "@another-me/api",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc --noEmit",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@another-me/shared": "workspace:*",
    "@fastify/cors": "latest",
    "@prisma/client": "latest",
    "fastify": "latest",
    "openai": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "prisma": "latest",
    "tsx": "latest",
    "typescript": "latest",
    "vitest": "latest"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

- [ ] **Step 2: Create API TypeScript config**

Create `apps/api/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "prisma"]
}
```

- [ ] **Step 3: Add Prisma schema**

Create `apps/api/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Agent {
  id          String   @id @default(cuid())
  name        String
  ownerLabel  String
  category    String
  persona     String
  skills      String[]
  rules       String[]
  modelConfig Json     @default("{}")
  maxRounds   Int      @default(6)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  runsAsA ConversationRun[] @relation("RunAgentA")
  runsAsB ConversationRun[] @relation("RunAgentB")
  messages ConversationMessage[]
}

model Scenario {
  id              String   @id @default(cuid())
  slug            String   @unique
  name            String
  description     String
  prompt          String
  closingPrompt   String
  suggestedTopics String[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  runs ConversationRun[]
}

model ConversationRun {
  id                  String   @id @default(cuid())
  topic               String
  requestedMaxRounds  Int
  effectiveMaxRounds  Int
  matchScore          Int
  matchReasons        String[]
  matchRisks          String[]
  provider            String
  status              String   @default("completed")
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  agentAId   String
  agentA     Agent    @relation("RunAgentA", fields: [agentAId], references: [id])
  agentBId   String
  agentB     Agent    @relation("RunAgentB", fields: [agentBId], references: [id])
  scenarioId String
  scenario   Scenario @relation(fields: [scenarioId], references: [id])

  messages ConversationMessage[]
  report   ConversationReport?
}

model ConversationMessage {
  id             String   @id @default(cuid())
  turnIndex      Int
  content        String
  createdAt      DateTime @default(now())

  runId          String
  run            ConversationRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  speakerAgentId String
  speakerAgent   Agent @relation(fields: [speakerAgentId], references: [id])
}

model ConversationReport {
  id                 String   @id @default(cuid())
  summary            String
  matchScore         Int
  sharedInterests    String[]
  tensions           String[]
  suggestedNextSteps String[]
  reusablePrompt     String
  raw                Json     @default("{}")
  createdAt          DateTime @default(now())

  runId String @unique
  run   ConversationRun @relation(fields: [runId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 4: Add Prisma client helper**

Create `apps/api/src/prisma.ts`:

```ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
```

- [ ] **Step 5: Add environment parser**

Create `apps/api/src/env.ts`:

```ts
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().positive().default(4000),
  LLM_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
  MAX_CONVERSATION_ROUNDS: z.coerce.number().int().min(2).max(10).default(6),
});

export const env = envSchema.parse(process.env);
```

- [ ] **Step 6: Add seed data**

Create `apps/api/prisma/seed.ts` with four agents and four scenarios:

```ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const agents = [
  {
    name: 'Founder Agent',
    ownerLabel: 'Another Me Demo',
    category: 'Startup',
    persona: 'A focused founder who explains product vision, risks, and traction clearly.',
    skills: ['pitching', 'product strategy', 'hackathon demos'],
    rules: ['Be concise', 'Ask for concrete investor feedback'],
    maxRounds: 6,
  },
  {
    name: 'VC Agent',
    ownerLabel: 'Another Me Demo',
    category: 'Investment',
    persona: 'A skeptical but constructive investor who tests market size, defensibility, and founder insight.',
    skills: ['venture capital', 'market analysis', 'business models'],
    rules: ['Challenge assumptions', 'End with an investment memo angle'],
    maxRounds: 6,
  },
  {
    name: 'Coding Partner Agent',
    ownerLabel: 'Another Me Demo',
    category: 'Code',
    persona: 'A pragmatic AI coding partner who breaks product ideas into shippable implementation steps.',
    skills: ['AI coding', 'system design', 'debugging'],
    rules: ['Prefer small working slices', 'Name technical tradeoffs'],
    maxRounds: 6,
  },
  {
    name: 'Social Explorer Agent',
    ownerLabel: 'Another Me Demo',
    category: 'Social',
    persona: 'A warm social explorer who looks for shared interests, lived context, and emotional resonance.',
    skills: ['conversation', 'empathy', 'interest discovery'],
    rules: ['Stay curious', 'Reflect common ground'],
    maxRounds: 6,
  },
];

const scenarios = [
  {
    slug: 'cafe',
    name: 'Cafe',
    description: 'Casual conversation for interests, values, and relationship discovery.',
    prompt: 'You are meeting in a relaxed cafe. Keep the tone human, curious, and specific.',
    closingPrompt: 'The conversation is ending soon. Surface common ground and one thoughtful next step.',
    suggestedTopics: ['Find shared AI coding and music interests', 'Understand life in another city'],
  },
  {
    slug: 'exchange',
    name: 'Exchange',
    description: 'Business evaluation, investment debate, and commercial strategy.',
    prompt: 'You are in a focused business exchange. Discuss market, risk, differentiation, and evidence.',
    closingPrompt: 'The conversation is ending soon. Summarize conviction, doubts, and next diligence steps.',
    suggestedTopics: ['Evaluate Another Me for seed investment', 'Stress-test a hackathon startup idea'],
  },
  {
    slug: 'lab',
    name: 'Lab',
    description: 'Structured specialist exploration for research and technical questions.',
    prompt: 'You are in a lab. Be precise, evidence-seeking, and careful about uncertainty.',
    closingPrompt: 'The conversation is ending soon. Name open questions and a practical experiment.',
    suggestedTopics: ['Explore a technical uncertainty', 'Compare research directions'],
  },
  {
    slug: 'coding-club',
    name: 'Coding Club',
    description: 'AI coding, product building, implementation planning, and demo preparation.',
    prompt: 'You are in a coding club. Focus on practical implementation and shippable decisions.',
    closingPrompt: 'The conversation is ending soon. Produce a compact build plan and risk list.',
    suggestedTopics: ['Plan the module three demo', 'Turn a product concept into build tasks'],
  },
];

async function main() {
  for (const agent of agents) {
    await prisma.agent.upsert({
      where: { name: agent.name },
      update: agent,
      create: agent,
    });
  }

  for (const scenario of scenarios) {
    await prisma.scenario.upsert({
      where: { slug: scenario.slug },
      update: scenario,
      create: scenario,
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 7: Install dependencies and generate Prisma client**

Run:

```bash
pnpm install
pnpm --filter @another-me/api db:generate
```

Expected: dependencies install and Prisma client generation succeeds.

- [ ] **Step 8: Commit API data layer**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat: add api data model and seeds"
```

### Task 4: API Services, Providers, Routes, And Tests

**Files:**
- Create: `apps/api/src/llm/types.ts`
- Create: `apps/api/src/llm/mockProvider.ts`
- Create: `apps/api/src/llm/openaiProvider.ts`
- Create: `apps/api/src/llm/provider.ts`
- Create: `apps/api/src/services/matcher.ts`
- Create: `apps/api/src/services/conversation.ts`
- Create: `apps/api/src/routes/social.ts`
- Create: `apps/api/src/index.ts`
- Create: `apps/api/src/services/matcher.test.ts`
- Create: `apps/api/src/llm/mockProvider.test.ts`

- [ ] **Step 1: Add provider types**

Create `apps/api/src/llm/types.ts`:

```ts
export type ChatRequest = {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  responseFormat?: 'text' | 'json';
};

export type ChatProvider = {
  name: string;
  complete(request: ChatRequest): Promise<string>;
};
```

- [ ] **Step 2: Add deterministic mock provider**

Create `apps/api/src/llm/mockProvider.ts`:

```ts
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
        suggestedNextSteps: ['Run one focused follow-up conversation', 'Save the transcript', 'Turn the best insight into a task'],
        reusablePrompt: `Continue this scenario with stricter evidence: ${latest.slice(0, 120)}`,
      });
    }
    return `I hear the direction: ${latest.slice(0, 160)}. My next useful contribution is to make it concrete, name one risk, and propose a small follow-up.`;
  },
};
```

- [ ] **Step 3: Add OpenAI provider**

Create `apps/api/src/llm/openaiProvider.ts`:

```ts
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
```

- [ ] **Step 4: Add provider selector**

Create `apps/api/src/llm/provider.ts`:

```ts
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
```

- [ ] **Step 5: Add matcher service**

Create `apps/api/src/services/matcher.ts`:

```ts
import type { Agent, Scenario } from '@prisma/client';
import type { MatchResult } from '@another-me/shared';

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

  const topicAlignment = Math.min(30, (overlapCount(topicWords, agentAWords) + overlapCount(topicWords, agentBWords)) * 8);
  const scenarioAlignment = Math.min(30, (overlapCount(scenarioWords, agentAWords) + overlapCount(scenarioWords, agentBWords)) * 5);
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
```

- [ ] **Step 6: Add conversation service**

Create `apps/api/src/services/conversation.ts`:

```ts
import type { Agent, ConversationMessage, ConversationReport, ConversationRun, Scenario } from '@prisma/client';
import type { SocialRunRequest } from '@another-me/shared';
import { env } from '../env';
import { prisma } from '../prisma';
import type { ChatProvider } from '../llm/types';
import { matchAgents } from './matcher';

const speakerSystem = (agent: Agent, scenario: Scenario, closing: boolean) => [
  scenario.prompt,
  closing ? scenario.closingPrompt : '',
  `You are ${agent.name}. Persona: ${agent.persona}`,
  `Skills: ${agent.skills.join(', ')}`,
  `Rules: ${agent.rules.join('; ')}`,
].filter(Boolean).join('\n\n');

const transcriptFor = (messages: Array<{ speakerName: string; content: string }>) =>
  messages.map((message) => `${message.speakerName}: ${message.content}`).join('\n');

export const runConversation = async (
  request: SocialRunRequest,
  provider: ChatProvider,
): Promise<{
  run: ConversationRun;
  messages: Array<ConversationMessage & { speakerAgent: Agent }>;
  report: ConversationReport;
}> => {
  if (request.agentAId === request.agentBId) {
    throw new Error('Choose two different agents.');
  }

  const [agentA, agentB, scenario] = await Promise.all([
    prisma.agent.findUnique({ where: { id: request.agentAId } }),
    prisma.agent.findUnique({ where: { id: request.agentBId } }),
    prisma.scenario.findUnique({ where: { id: request.scenarioId } }),
  ]);

  if (!agentA || !agentB || !scenario) {
    throw new Error('Agent or scenario not found.');
  }

  const match = matchAgents(agentA, agentB, scenario, request.topic, request.maxRounds);
  const effectiveMaxRounds = Math.min(match.recommendedMaxRounds, env.MAX_CONVERSATION_ROUNDS);
  const run = await prisma.conversationRun.create({
    data: {
      topic: request.topic,
      requestedMaxRounds: request.maxRounds,
      effectiveMaxRounds,
      matchScore: match.score,
      matchReasons: match.reasons,
      matchRisks: match.risks,
      provider: provider.name,
      agentAId: agentA.id,
      agentBId: agentB.id,
      scenarioId: scenario.id,
    },
  });

  const savedMessages: Array<ConversationMessage & { speakerAgent: Agent }> = [];
  for (let turnIndex = 1; turnIndex <= effectiveMaxRounds; turnIndex += 1) {
    const speaker = turnIndex % 2 === 1 ? agentA : agentB;
    const closing = effectiveMaxRounds - turnIndex < 2;
    const transcript = transcriptFor(savedMessages.map((message) => ({
      speakerName: message.speakerAgent.name,
      content: message.content,
    })));
    const content = await provider.complete({
      system: speakerSystem(speaker, scenario, closing),
      messages: [{
        role: 'user',
        content: `Topic: ${request.topic}\n\nConversation so far:\n${transcript || 'No messages yet.'}\n\nSpeak as ${speaker.name}.`,
      }],
    });
    const message = await prisma.conversationMessage.create({
      data: {
        runId: run.id,
        speakerAgentId: speaker.id,
        turnIndex,
        content,
      },
      include: { speakerAgent: true },
    });
    savedMessages.push(message);
  }

  const reportRaw = await provider.complete({
    system: 'Return a concise JSON report for this agent conversation.',
    responseFormat: 'json',
    messages: [{
      role: 'user',
      content: `Topic: ${request.topic}\nMatch score: ${match.score}\nTranscript:\n${transcriptFor(savedMessages.map((message) => ({
        speakerName: message.speakerAgent.name,
        content: message.content,
      })))}`,
    }],
  });

  const parsed = JSON.parse(reportRaw) as {
    summary?: string;
    sharedInterests?: string[];
    tensions?: string[];
    suggestedNextSteps?: string[];
    reusablePrompt?: string;
  };

  const report = await prisma.conversationReport.create({
    data: {
      runId: run.id,
      summary: parsed.summary || 'The agents completed a conversation.',
      matchScore: match.score,
      sharedInterests: parsed.sharedInterests || [],
      tensions: parsed.tensions || [],
      suggestedNextSteps: parsed.suggestedNextSteps || [],
      reusablePrompt: parsed.reusablePrompt || `Continue discussing: ${request.topic}`,
      raw: parsed,
    },
  });

  return { run, messages: savedMessages, report };
};
```

- [ ] **Step 7: Add social routes**

Create `apps/api/src/routes/social.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { socialRunRequestSchema } from '@another-me/shared';
import { getProvider } from '../llm/provider';
import { prisma } from '../prisma';
import { matchAgents } from '../services/matcher';
import { runConversation } from '../services/conversation';

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
    if (!run) return reply.code(404).send({ error: 'Conversation not found.', code: 'NOT_FOUND' });
    return run;
  });
};
```

- [ ] **Step 8: Add Fastify entrypoint**

Create `apps/api/src/index.ts`:

```ts
import cors from '@fastify/cors';
import Fastify from 'fastify';
import { env } from './env';
import { registerSocialRoutes } from './routes/social';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(registerSocialRoutes);

await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
```

- [ ] **Step 9: Add matcher test**

Create `apps/api/src/services/matcher.test.ts`:

```ts
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
```

- [ ] **Step 10: Add mock provider test**

Create `apps/api/src/llm/mockProvider.test.ts`:

```ts
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
```

- [ ] **Step 11: Run API tests**

Run:

```bash
pnpm --filter @another-me/api test
```

Expected: matcher and provider tests pass.

- [ ] **Step 12: Commit API services and routes**

```bash
git add apps/api/src
git commit -m "feat: add social api routes and conversation engine"
```

### Task 5: Web Package And Workbench UI

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/index.html`
- Create: `apps/web/postcss.config.js`
- Create: `apps/web/tailwind.config.js`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/styles.css`
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/components/Workbench.tsx`

- [ ] **Step 1: Create web package manifest**

Create `apps/web/package.json`:

```json
{
  "name": "@another-me/web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@another-me/shared": "workspace:*",
    "@vitejs/plugin-react": "latest",
    "vite": "latest",
    "typescript": "latest",
    "react": "latest",
    "react-dom": "latest",
    "lucide-react": "latest"
  },
  "devDependencies": {
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "tailwindcss": "latest",
    "postcss": "latest",
    "autoprefixer": "latest",
    "vitest": "latest"
  }
}
```

- [ ] **Step 2: Create web TypeScript config**

Create `apps/web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Add Vite HTML entry**

Create `apps/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Another Me Social</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Add Tailwind config**

Create `apps/web/postcss.config.js`:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

Create `apps/web/tailwind.config.js`:

```js
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

- [ ] **Step 5: Add API client**

Create `apps/web/src/api/client.ts`:

```ts
import type { SocialRunRequest } from '@another-me/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const json = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body as T;
};

export const api = {
  health: () => json<{ ok: boolean; provider: string }>('/health'),
  agents: () => json<any[]>('/agents'),
  scenarios: () => json<any[]>('/scenarios'),
  match: (body: SocialRunRequest) => json<any>('/matches', { method: 'POST', body: JSON.stringify(body) }),
  converse: (body: SocialRunRequest) => json<any>('/conversations', { method: 'POST', body: JSON.stringify(body) }),
  history: () => json<any[]>('/conversations'),
  conversation: (id: string) => json<any>(`/conversations/${id}`),
};
```

- [ ] **Step 6: Add React entry**

Create `apps/web/src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 7: Add App component**

Create `apps/web/src/App.tsx`:

```tsx
import { Workbench } from './components/Workbench';

export const App = () => <Workbench />;
```

- [ ] **Step 8: Add workbench component**

Create `apps/web/src/components/Workbench.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Activity, MessagesSquare, Play, RefreshCw, Sparkles } from 'lucide-react';
import { api } from '../api/client';

type Agent = {
  id: string;
  name: string;
  ownerLabel: string;
  category: string;
  persona: string;
  skills: string[];
  maxRounds: number;
};

type Scenario = {
  id: string;
  name: string;
  description: string;
  suggestedTopics: string[];
};

export const Workbench = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [provider, setProvider] = useState('mock');
  const [agentAId, setAgentAId] = useState('');
  const [agentBId, setAgentBId] = useState('');
  const [scenarioId, setScenarioId] = useState('');
  const [topic, setTopic] = useState('Evaluate Another Me as a hackathon product and find the next best demo move.');
  const [maxRounds, setMaxRounds] = useState(6);
  const [match, setMatch] = useState<any>(null);
  const [conversation, setConversation] = useState<any>(null);
  const [status, setStatus] = useState('Loading social workbench...');
  const [busy, setBusy] = useState(false);

  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === scenarioId),
    [scenarioId, scenarios],
  );

  const load = async () => {
    const [health, nextAgents, nextScenarios, nextHistory] = await Promise.all([
      api.health(),
      api.agents(),
      api.scenarios(),
      api.history(),
    ]);
    setProvider(health.provider);
    setAgents(nextAgents);
    setScenarios(nextScenarios);
    setHistory(nextHistory);
    setAgentAId(nextAgents[0]?.id || '');
    setAgentBId(nextAgents[1]?.id || '');
    setScenarioId(nextScenarios[0]?.id || '');
    setStatus('Ready.');
  };

  useEffect(() => {
    load().catch((error) => setStatus(error.message));
  }, []);

  const requestBody = { agentAId, agentBId, scenarioId, topic, maxRounds };

  const generateMatch = async () => {
    setBusy(true);
    setStatus('Scoring agent match...');
    try {
      const result = await api.match(requestBody);
      setMatch(result);
      setStatus('Match ready.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Match failed.');
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    setBusy(true);
    setStatus('Running agent conversation...');
    try {
      const result = await api.converse(requestBody);
      setConversation(result);
      setMatch({
        score: result.run.matchScore,
        reasons: result.run.matchReasons,
        risks: result.run.matchRisks,
        recommendedMaxRounds: result.run.effectiveMaxRounds,
      });
      setHistory(await api.history());
      setStatus('Conversation complete.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Conversation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#20231f]">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5">
        <header className="flex flex-col gap-3 border-b border-[#d7d8ce] pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#67756b]">Another Me / Module 03</p>
            <h1 className="text-3xl font-semibold tracking-normal">Agent Social Workbench</h1>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded border border-[#c9cdc1] px-2 py-1">Provider: {provider}</span>
            <button className="inline-flex items-center gap-2 rounded border border-[#b9bdae] px-3 py-2" onClick={() => load()}>
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[320px_1fr_360px]">
          <aside className="space-y-3">
            <div className="rounded border border-[#d7d8ce] bg-white p-4">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Sparkles size={18} /> Setup</h2>
              <label className="block text-sm font-medium">Scenario</label>
              <select className="mt-1 w-full rounded border border-[#c9cdc1] p-2" value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>
                {scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
              </select>
              <p className="mt-2 text-sm text-[#596157]">{selectedScenario?.description}</p>

              <label className="mt-4 block text-sm font-medium">Agent A</label>
              <select className="mt-1 w-full rounded border border-[#c9cdc1] p-2" value={agentAId} onChange={(event) => setAgentAId(event.target.value)}>
                {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </select>

              <label className="mt-4 block text-sm font-medium">Agent B</label>
              <select className="mt-1 w-full rounded border border-[#c9cdc1] p-2" value={agentBId} onChange={(event) => setAgentBId(event.target.value)}>
                {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </select>

              <label className="mt-4 block text-sm font-medium">Topic</label>
              <textarea className="mt-1 min-h-28 w-full rounded border border-[#c9cdc1] p-2" value={topic} onChange={(event) => setTopic(event.target.value)} />

              <label className="mt-4 block text-sm font-medium">Max rounds</label>
              <input className="mt-1 w-full" min={2} max={10} type="range" value={maxRounds} onChange={(event) => setMaxRounds(Number(event.target.value))} />
              <div className="text-sm text-[#596157]">{maxRounds} turns</div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="rounded bg-[#26362d] px-3 py-2 text-white disabled:opacity-60" disabled={busy} onClick={generateMatch}>
                  Match
                </button>
                <button className="inline-flex items-center justify-center gap-2 rounded bg-[#8f493f] px-3 py-2 text-white disabled:opacity-60" disabled={busy} onClick={run}>
                  <Play size={16} /> Run
                </button>
              </div>
              <p className="mt-3 text-sm text-[#596157]">{status}</p>
            </div>
          </aside>

          <section className="space-y-4">
            <div className="rounded border border-[#d7d8ce] bg-white p-4">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Activity size={18} /> Match</h2>
              {match ? (
                <div className="grid gap-3 md:grid-cols-[120px_1fr]">
                  <div className="text-5xl font-semibold">{match.score}</div>
                  <div className="space-y-2 text-sm">
                    <p>Recommended rounds: {match.recommendedMaxRounds}</p>
                    <ul className="list-disc pl-5">{match.reasons?.map((item: string) => <li key={item}>{item}</li>)}</ul>
                    <ul className="list-disc pl-5 text-[#8f493f]">{match.risks?.map((item: string) => <li key={item}>{item}</li>)}</ul>
                  </div>
                </div>
              ) : <p className="text-sm text-[#596157]">Generate a match to see fit, risks, and recommended turns.</p>}
            </div>

            <div className="rounded border border-[#d7d8ce] bg-white p-4">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><MessagesSquare size={18} /> Transcript</h2>
              <div className="space-y-3">
                {conversation?.messages?.length ? conversation.messages.map((message: any) => (
                  <article className="rounded border border-[#e2e3dc] bg-[#fbfbf8] p-3" key={message.id}>
                    <div className="mb-1 text-sm font-semibold">{message.speakerAgent.name} / turn {message.turnIndex}</div>
                    <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                  </article>
                )) : <p className="text-sm text-[#596157]">Run a conversation to create the transcript.</p>}
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded border border-[#d7d8ce] bg-white p-4">
              <h2 className="mb-3 text-lg font-semibold">Report</h2>
              {conversation?.report ? (
                <div className="space-y-3 text-sm">
                  <p className="leading-6">{conversation.report.summary}</p>
                  <div><b>Shared interests</b><ul className="list-disc pl-5">{conversation.report.sharedInterests.map((item: string) => <li key={item}>{item}</li>)}</ul></div>
                  <div><b>Tensions</b><ul className="list-disc pl-5">{conversation.report.tensions.map((item: string) => <li key={item}>{item}</li>)}</ul></div>
                  <div><b>Next steps</b><ul className="list-disc pl-5">{conversation.report.suggestedNextSteps.map((item: string) => <li key={item}>{item}</li>)}</ul></div>
                </div>
              ) : <p className="text-sm text-[#596157]">The report appears after a run completes.</p>}
            </div>

            <div className="rounded border border-[#d7d8ce] bg-white p-4">
              <h2 className="mb-3 text-lg font-semibold">History</h2>
              <div className="space-y-2">
                {history.length ? history.map((run) => (
                  <button className="block w-full rounded border border-[#e2e3dc] p-2 text-left text-sm hover:bg-[#f7f7f2]" key={run.id} onClick={async () => setConversation(await api.conversation(run.id))}>
                    <b>{run.scenario.name}</b>
                    <span className="block text-[#596157]">{run.agentA.name} x {run.agentB.name}</span>
                  </button>
                )) : <p className="text-sm text-[#596157]">No runs yet.</p>}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
};
```

- [ ] **Step 9: Add styles**

Create `apps/web/src/styles.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

button,
select,
textarea,
input {
  font: inherit;
}
```

- [ ] **Step 10: Run web typecheck**

Run:

```bash
pnpm --filter @another-me/web typecheck
```

Expected: exits successfully.

- [ ] **Step 11: Commit web workbench**

```bash
git add apps/web
git commit -m "feat: add module three social workbench"
```

### Task 6: Docker Compose And README

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `apps/web/Dockerfile`
- Create: `docker-compose.yml`
- Modify: `README.md`

- [ ] **Step 1: Add API Dockerfile**

Create `apps/api/Dockerfile`:

```dockerfile
FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @another-me/api db:generate
EXPOSE 4000
CMD ["pnpm", "--filter", "@another-me/api", "dev"]
```

- [ ] **Step 2: Add web Dockerfile**

Create `apps/web/Dockerfile`:

```dockerfile
FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY . .
EXPOSE 5173
CMD ["pnpm", "--filter", "@another-me/web", "dev"]
```

- [ ] **Step 3: Add Docker Compose**

Create `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:latest
    environment:
      POSTGRES_USER: another_me
      POSTGRES_PASSWORD: another_me
      POSTGRES_DB: another_me
    ports:
      - "5432:5432"
    volumes:
      - another_me_postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U another_me -d another_me"]
      interval: 5s
      timeout: 5s
      retries: 10

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      DATABASE_URL: postgresql://another_me:another_me@postgres:5432/another_me
      API_PORT: 4000
      LLM_PROVIDER: ${LLM_PROVIDER:-mock}
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
      OPENAI_MODEL: ${OPENAI_MODEL:-gpt-4.1-mini}
      MAX_CONVERSATION_ROUNDS: ${MAX_CONVERSATION_ROUNDS:-6}
    ports:
      - "4000:4000"
    depends_on:
      postgres:
        condition: service_healthy
    command: sh -c "pnpm --filter @another-me/api db:deploy || pnpm --filter @another-me/api db:migrate -- --name init && pnpm --filter @another-me/api db:seed && pnpm --filter @another-me/api dev"

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    environment:
      VITE_API_BASE_URL: http://localhost:4000
    ports:
      - "5173:5173"
    depends_on:
      - api

volumes:
  another_me_postgres:
```

- [ ] **Step 4: Update README**

Replace `README.md` with:

```markdown
# Another Me

Another Me is a hackathon product for creating digital agent doubles and letting them interact in scenario-based social spaces.

## Current Structure

- `apps/web`: new C-lite React workbench for module three.
- `apps/api`: new Fastify API for module three.
- `packages/shared`: shared Zod contracts and TypeScript types.
- `modules`, `site`, `scripts/serve-local-mirror.mjs`: legacy local mirror kept for reference.

## Module Three Scope

This branch implements the social flow after agents already exist:

1. Select seeded agents.
2. Select a scenario.
3. Score the match.
4. Run a short multi-round agent conversation.
5. Generate a structured report.
6. Review persisted history.

It does not implement agent upload, login, marketplace, credits, fork, or sandbox execution.

## Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

Open:

```text
http://localhost:5173
```

API:

```text
http://localhost:4000/health
```

The default provider is `mock`, so no API key is required.

## Optional OpenAI Provider

Set these in `.env` before starting Docker Compose:

```text
LLM_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4.1-mini
```

## Local Development

```bash
pnpm install
pnpm --filter @another-me/api db:generate
pnpm --filter @another-me/api db:migrate
pnpm --filter @another-me/api db:seed
pnpm dev
```

## Legacy Mirror

```bash
npm run mirror
```

Default mirror URL:

```text
http://localhost:4174/dashboard
```

## Verification

```bash
pnpm typecheck
pnpm test
pnpm build
```

Manual verification:

1. Start Docker Compose.
2. Open the web app.
3. Pick two seeded agents and one scenario.
4. Generate a match.
5. Run a conversation.
6. Confirm transcript, report, and history render.

## Collaboration Notes

- Keep module three independent from the legacy mirror.
- Do not implement agent upload in module three.
- Keep LLM provider code behind the provider interface.
- Keep mock provider reliable for demos without secrets.
- Update this README when setup or architecture changes.
```

- [ ] **Step 5: Commit Docker and docs**

```bash
git add apps/api/Dockerfile apps/web/Dockerfile docker-compose.yml README.md
git commit -m "chore: add docker compose and docs"
```

### Task 7: End-To-End Verification And Fixes

**Files:**
- Modify files from previous tasks only if verification reveals issues.

- [ ] **Step 1: Run install**

Run:

```bash
pnpm install
```

Expected: install completes and `pnpm-lock.yaml` is current.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: all workspace packages typecheck.

- [ ] **Step 3: Run tests**

Run:

```bash
pnpm test
```

Expected: API tests pass and packages without tests exit cleanly.

- [ ] **Step 4: Run builds**

Run:

```bash
pnpm build
```

Expected: API typecheck and web production build pass.

- [ ] **Step 5: Run Docker Compose**

Run:

```bash
docker compose up --build
```

Expected:

- Postgres becomes healthy.
- API starts on `http://localhost:4000`.
- Web starts on `http://localhost:5173`.
- API logs show seed completion.

- [ ] **Step 6: Verify API health**

Run in another terminal:

```bash
curl -s http://localhost:4000/health
```

Expected response includes:

```json
{"ok":true,"provider":"mock"}
```

- [ ] **Step 7: Verify seeded data**

Run:

```bash
curl -s http://localhost:4000/agents | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>console.log(JSON.parse(s).length))"
curl -s http://localhost:4000/scenarios | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>console.log(JSON.parse(s).length))"
```

Expected: each command prints at least `4`.

- [ ] **Step 8: Verify match endpoint**

Run:

```bash
node - <<'NODE'
const api = 'http://localhost:4000';
const agents = await fetch(`${api}/agents`).then((r) => r.json());
const scenarios = await fetch(`${api}/scenarios`).then((r) => r.json());
const result = await fetch(`${api}/matches`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agentAId: agents[0].id,
    agentBId: agents[1].id,
    scenarioId: scenarios[0].id,
    topic: 'Evaluate Another Me as a hackathon demo',
    maxRounds: 4
  })
}).then((r) => r.json());
console.log(result.score, result.recommendedMaxRounds);
NODE
```

Expected: prints a score from `0` to `100` and recommended rounds.

- [ ] **Step 9: Verify conversation endpoint**

Run:

```bash
node - <<'NODE'
const api = 'http://localhost:4000';
const agents = await fetch(`${api}/agents`).then((r) => r.json());
const scenarios = await fetch(`${api}/scenarios`).then((r) => r.json());
const result = await fetch(`${api}/conversations`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agentAId: agents[0].id,
    agentBId: agents[1].id,
    scenarioId: scenarios[0].id,
    topic: 'Evaluate Another Me as a hackathon demo',
    maxRounds: 4
  })
}).then((r) => r.json());
console.log(result.messages.length, result.report.summary.length > 0);
NODE
```

Expected: prints `4 true`.

- [ ] **Step 10: Manually verify web app**

Open:

```text
http://localhost:5173
```

Confirm:

- Seeded agents appear in both selectors.
- Scenarios appear.
- Match button renders score, reasons, risks.
- Run button renders transcript and report.
- History shows the completed run.
- Refreshing the page keeps history.

- [ ] **Step 11: Stop Docker Compose**

Run:

```bash
docker compose down
```

Expected: containers stop cleanly.

- [ ] **Step 12: Commit verification fixes**

If fixes were needed:

```bash
git add apps packages docker-compose.yml README.md package.json pnpm-lock.yaml
git commit -m "fix: stabilize module three full-stack demo"
```

If no fixes were needed, skip this commit.

### Task 8: Final Branch Review And Push

**Files:**
- No planned file changes.

- [ ] **Step 1: Inspect git status**

Run:

```bash
git status --short --branch
```

Expected: only unrelated pre-existing untracked files may remain, such as `.DS_Store` or the planning document if intentionally untracked.

- [ ] **Step 2: Review commit history**

Run:

```bash
git log --oneline --decorate -8
```

Expected: branch contains the design commit and implementation commits.

- [ ] **Step 3: Push branch**

Run:

```bash
git push -u origin codex/module-3-social
```

Expected: branch pushes to GitHub successfully.

- [ ] **Step 4: Report completion**

Final report should include:

- Branch name.
- Pushed remote branch.
- Main app URL for local Docker.
- Verification commands run.
- Any remaining intentional exclusions, especially agent upload.

## Self-Review

- Spec coverage: The plan covers independent app structure, Docker Compose, Postgres, seeded agents and scenarios, matching, multi-round dialogue, reports, history, mock fallback, OpenAI provider, README updates, and verification.
- Scope check: Agent upload is explicitly excluded and no task implements it.
- Placeholder scan: No task uses TBD, TODO, or unspecified implementation instructions.
- Type consistency: Shared request field names are `agentAId`, `agentBId`, `scenarioId`, `topic`, and `maxRounds` across API and web tasks.
