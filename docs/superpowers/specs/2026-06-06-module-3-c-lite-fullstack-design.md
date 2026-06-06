# Module 3 C-Lite Full-Stack Design

## Goal

Build a C-lite independent full-stack app for Another Me module three. The app should demonstrate the social flow after agents already exist: select existing agents, choose a scenario, match agents, run an agent-to-agent conversation, generate a structured report, and review conversation history.

This design intentionally does not implement agent upload. Agent upload remains outside module three for now. Module three reads seeded or existing agents only.

## Context

The repository currently contains a local static mirror and module split:

- Existing mirror server: `scripts/serve-local-mirror.mjs`
- Existing static social page: `modules/web/social.html`
- Existing mock social script: `modules/web/social.js`
- Existing module social data: `data/module-social-conversations.json`
- Product planning document: `黑客松 another me.md`

The current module three page is useful as a reference, but it is a thin static demo with a mock report. The new work should add a clean full-stack app beside it, not replace the mirror.

## Scope

Module three C-lite includes:

- Independent app structure under `apps/web`, `apps/api`, and `packages/shared`.
- Docker Compose for local product-like development.
- Postgres-backed records for agents, scenarios, conversation runs, messages, and reports.
- Seeded agents and scenarios.
- Agent matching from selected scenario, topic, skills, category, and persona.
- Multi-round two-agent dialogue.
- Structured report generation.
- Conversation history and transcript review.
- Mock LLM provider fallback when no API key is configured.
- OpenAI provider as the first real provider.
- README updates for collaboration and local/Docker usage.

## Non-Goals

This version does not include:

- Agent upload or marketplace publishing.
- User login, teams, permissions, billing, credits, or agent purchase.
- Agent fork.
- Code sandbox execution.
- Long-term memory or persistent agent evolution.
- Real-time multiplayer open-world movement.
- Complex social map visualization.
- Production deployment to a cloud provider.

The data model should leave room for these later, but the C-lite implementation should not build them.

## Recommended Architecture

Use a lightweight TypeScript monorepo:

```text
apps/
  api/
    src/
      index.ts
      env.ts
      prisma.ts
      routes/
      services/
      llm/
    prisma/
      schema.prisma
      seed.ts
  web/
    src/
      main.tsx
      App.tsx
      api/
      components/
      pages/
      styles.css
packages/
  shared/
    src/
      types.ts
      schemas.ts
docker-compose.yml
README.md
```

The existing static mirror remains in place. The full-stack app is the forward-looking product surface.

## Tech Stack

- Frontend: Vite, React, TailwindCSS, TypeScript.
- Backend: Fastify, TypeScript.
- Database: Postgres.
- ORM: Prisma.
- Validation: Zod in `packages/shared`.
- LLM: OpenAI as first real provider, plus deterministic mock provider.
- Local orchestration: Docker Compose.

Fastify is preferred for this version because it is fast to wire, easy to understand, and sufficient for a hackathon-grade full-stack backend. The API boundaries should remain clear enough to migrate to a heavier framework later if needed.

## Agent Source

Agents are read-only from module three's perspective. The first version uses seeded records in Postgres. A later module-one integration can write into the same `agents` table or sync from a marketplace service.

Seed at least four demo agents:

- Founder Agent: startup/product pitching.
- VC Agent: investment evaluation.
- Coding Partner Agent: AI coding and implementation planning.
- Social Explorer Agent: casual conversation and empathy.

Each agent stores:

- `id`
- `name`
- `ownerLabel`
- `category`
- `persona`
- `skills`
- `rules`
- `modelConfig`
- `maxRounds`
- `createdAt`
- `updatedAt`

## Scenarios

Seed four scenarios from the product document:

- Cafe: casual chat, interests, relationship discovery.
- Exchange: startup, business, VC, commercial evaluation.
- Lab: specialist exploration and structured research.
- Coding Club: AI coding, product building, technical collaboration.

Each scenario stores:

- `id`
- `slug`
- `name`
- `description`
- `prompt`
- `closingPrompt`
- `suggestedTopics`
- `createdAt`
- `updatedAt`

## Matching Design

The C-lite matcher is deterministic and explainable. It scores a selected pair against a scenario and topic:

- Scenario/category alignment.
- Topic overlap with agent skills and persona.
- Complementarity between agent roles.
- Round compatibility using the smaller `maxRounds` value.

The matcher returns:

- `score`: number from 0 to 100.
- `reasons`: short list of human-readable reasons.
- `risks`: short list of possible conversation risks.
- `recommendedMaxRounds`: minimum of the two agents' `maxRounds` and the requested cap.

The first version does not need vector search or embeddings.

## Conversation Flow

The API creates a `conversationRun` with selected `agentA`, `agentB`, `scenario`, topic, and requested max rounds.

The dialogue engine:

1. Loads both agents and the scenario.
2. Computes `effectiveMaxRounds` as the minimum of both agent max rounds, requested max rounds, and environment max.
3. Builds a scenario prompt for `agentA`.
4. Asks `agentA` to produce message 1.
5. Passes scenario prompt plus transcript to `agentB`.
6. Alternates speakers until the round limit.
7. When two turns remain, injects the scenario closing prompt.
8. Generates a structured report from the transcript.
9. Stores every message and the report.

The first version can run synchronously in one HTTP request because C-lite conversations are short. If conversation latency becomes a problem, a later version can move runs to a background job.

## LLM Provider Design

Create a provider interface:

```ts
type ChatRequest = {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  responseFormat?: 'text' | 'json';
};

type ChatProvider = {
  complete(request: ChatRequest): Promise<string>;
};
```

Provider selection:

- If `LLM_PROVIDER=openai` and `OPENAI_API_KEY` exists, use OpenAI.
- Otherwise use mock provider.

The mock provider should produce deterministic, demo-friendly responses based on agent name, scenario, topic, and turn number. This keeps Docker demos reliable without secrets.

## API Design

Expose these endpoints:

```text
GET  /health
GET  /agents
GET  /scenarios
POST /matches
POST /conversations
GET  /conversations
GET  /conversations/:id
```

`POST /matches` request:

```json
{
  "agentAId": "agent-id",
  "agentBId": "agent-id",
  "scenarioId": "scenario-id",
  "topic": "Evaluate this hackathon idea",
  "maxRounds": 6
}
```

`POST /conversations` request uses the same shape and returns:

```json
{
  "run": {},
  "messages": [],
  "report": {}
}
```

Errors should return JSON:

```json
{
  "error": "Human-readable message",
  "code": "STABLE_ERROR_CODE"
}
```

## Frontend Design

The first screen is the module three workbench, not a landing page.

Primary regions:

- Scenario selector.
- Agent pair selector from seeded agents.
- Topic input and max-rounds control.
- Match panel showing score, reasons, risks, and recommended rounds.
- Run button.
- Transcript panel.
- Report panel.
- History list.

The UI should feel like a focused social operations console: dense, readable, and direct. It should avoid a marketing hero and avoid the current mirror's marketplace feel.

The workbench should handle:

- Loading states for agents, scenarios, matches, and conversations.
- Empty history.
- Mock-provider notice when the API is not using a real LLM key.
- API errors.
- Responsive layout for laptop and mobile widths.

## Data Model

Prisma models:

```text
Agent
Scenario
ConversationRun
ConversationMessage
ConversationReport
```

Relationships:

- A run belongs to `agentA`, `agentB`, and `scenario`.
- A run has many messages.
- A run has one report.

Reports store structured JSON fields:

- summary
- matchScore
- sharedInterests
- tensions
- suggestedNextSteps
- reusablePrompt

## Configuration

Root `.env.example` should include:

```text
DATABASE_URL=postgresql://another_me:another_me@postgres:5432/another_me
API_PORT=4000
WEB_PORT=5173
LLM_PROVIDER=mock
OPENAI_API_KEY=
OPENAI_MODEL=
MAX_CONVERSATION_ROUNDS=6
```

The Docker Compose path should default to mock provider so the app runs immediately.

## README Requirements

Update `README.md` to explain:

- Current repo purpose.
- Difference between legacy mirror and new full-stack app.
- Module three scope and non-scope.
- Local Docker Compose startup.
- Optional real OpenAI setup.
- Main commands.
- Directory map.
- Collaboration notes for future AI coding agents.

## Testing And Verification

Backend:

- Unit test matcher scoring.
- Unit test mock provider output shape.
- API integration test for `POST /matches`.
- API integration test for `POST /conversations` with mock provider.

Frontend:

- Basic component or app smoke test if the Vite setup includes a test runner.
- At minimum, run typecheck and production build.

End-to-end manual verification:

1. Start Docker Compose.
2. Open the web app.
3. Select two seeded agents.
4. Select a scenario.
5. Enter a topic.
6. Generate a match.
7. Run a conversation.
8. Confirm transcript and report render.
9. Refresh and confirm history is still present.

## Implementation Constraints

- Keep the full-stack app independent from the existing mirror.
- Do not delete or rewrite the mirror.
- Do not implement upload in this module.
- Prefer small, focused files.
- Use shared Zod schemas for request and response contracts.
- Keep provider code behind a small interface.
- Keep mock provider reliable enough for hackathon demos.
- Do not require API keys for the default Docker demo.

## Open Decisions

This spec chooses OpenAI as the first real provider and mock as the default provider. Anthropic remains a later provider behind the same interface.

This spec chooses no authentication for C-lite. Demo users interact with seeded agents only.

This spec chooses synchronous conversation runs for C-lite. Background jobs are deferred.
