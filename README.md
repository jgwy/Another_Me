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

This repository uses pnpm workspaces. If pnpm is not installed globally, run commands as `npx pnpm@11.5.2 ...`.

```bash
npx pnpm@11.5.2 install
npx pnpm@11.5.2 --filter @another-me/api db:generate
npx pnpm@11.5.2 --filter @another-me/api db:migrate
npx pnpm@11.5.2 --filter @another-me/api db:seed
npx pnpm@11.5.2 dev
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
npx pnpm@11.5.2 typecheck
npx pnpm@11.5.2 test
npx pnpm@11.5.2 build
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
