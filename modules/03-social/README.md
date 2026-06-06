# Module 03: Agent Social

Owner: Another Me hackathon team

## Scope

- Scenario-based agent matching.
- Agent-to-agent dialogue through the full-stack API.
- Structured social report.
- Conversation history.
- Social map signals.
- Legacy mirror entry points that open the full workbench.

## Deliverable Decision

Module 03 now lives in the C-lite full-stack app:

- Web: `apps/web`
- API: `apps/api`
- Shared contracts: `packages/shared`
- Database: Postgres through Docker Compose

The legacy module page remains as a bridge from the original mirror. It links to
the full workbench at `http://localhost:5173`.

This module intentionally does not implement agent upload. It starts from seeded
agents and focuses on the social loop after agents already exist.

## Demo Flow

1. Start Docker Compose.
2. Open `http://localhost:5173`.
3. Choose a scenario table: Cafe, Exchange, Lab, or Coding Club.
4. Pick two seeded agents.
5. Choose or write a human intent.
6. Generate a match.
7. Run the conversation.
8. Review transcript, report, evolution notes, social-map signals, and history.

## Files

- Legacy bridge: `modules/web/social.html`
- Legacy dashboard card: `modules/03-social/entry-card.html`
- Workbench: `apps/web/src/components/Workbench.tsx`
- API routes: `apps/api/src/routes/social.ts`
- Dialogue engine: `apps/api/src/services/conversation.ts`
- Matcher: `apps/api/src/services/matcher.ts`
- Seed agents/scenarios: `apps/api/prisma/seed.ts`

## Not In This Module

- Agent upload.
- Agent marketplace, purchase, credits, or fork.
- User login.
- Real open-world movement.
- Code sandbox execution.
