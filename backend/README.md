# Another Me — Backend

FastAPI + async SQLAlchemy 2.0 + PostgreSQL, managed with [`uv`](https://docs.astral.sh/uv/).

The REST + SSE surface is defined by the locked contract in [`../docs/api-contract.md`](../docs/api-contract.md).
All endpoints are implemented: auth, agents (create-from-questionnaire, search, fork, patch),
scenarios, dispatches (with profile/id matching), conversations + the live SSE stream, reports,
evolutions (apply/rollback), and the marketplace. The conversation **orchestrator** runs the turn
protocol (R12–R14) as a background task, persists each message, streams it over SSE, and calls the
isolated **sandbox-runner** for any agent-emitted code (re-injecting stdout as evidence).

### LLM providers (`app/llm/`)

A unified async interface (`complete()` / `stream()`) over three providers, selected by
`LLM_PROVIDER` / `LLM_MODEL`:

- `openai` — Responses API (`openai` 2.41.0)
- `anthropic` — Messages API (`anthropic` 0.106.0)
- `mock` — **deterministic, no API key needed**; makes the whole pipeline runnable + testable
  offline. If a real provider is selected but its API key is missing, the layer logs a warning and
  falls back to `mock` so the stack always boots.

## Requirements

- `uv` (project tooling; the Docker image pins `0.11.19`)
- Python `>=3.13` (uv provisions it automatically)
- A reachable PostgreSQL instance for running migrations / the server

## Configuration

Settings load from environment variables or a `.env` file (see `app/core/config.py`). Key vars:

| Variable | Default |
| --- | --- |
| `DATABASE_URL` | `postgresql+asyncpg://another_me:another_me@localhost:5432/another_me` |
| `JWT_SECRET` | `dev-insecure-change-me` |
| `JWT_ALGORITHM` | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` |
| `LLM_PROVIDER` / `LLM_MODEL` | `openai` / `gpt-5-mini` |
| `CORS_ORIGINS` | `*` |

## Run locally

```bash
# 1. Install dependencies (creates .venv + uv.lock)
uv sync

# 2. Point at your database
export DATABASE_URL=postgresql+asyncpg://another_me:another_me@localhost:5432/another_me

# 3. Apply migrations
uv run alembic upgrade head

# 4. Seed scenarios + NPC roster (idempotent: 4 scenarios, 12 public NPC agents)
uv run python -m app.seeds.run

# 5. Start the API (http://localhost:8000, docs at /docs)
uv run uvicorn app.main:app --reload
```

## Run without API keys (mock provider)

Set `LLM_PROVIDER=mock` to run the entire flow — agent synthesis, the streamed turn protocol,
sandbox evidence, reports, and evolution — deterministically and offline:

```bash
LLM_PROVIDER=mock uv run uvicorn app.main:app --reload
```

## Verify the backend

With a reachable Postgres + the sandbox-runner (`cd ../sandbox-runner && uv run uvicorn main:app --port 8001`):

```bash
# AE1 turn-protocol check + full mock pipeline (dispatch → SSE → sandbox → report → evolution)
LLM_PROVIDER=mock SANDBOX_URL=http://127.0.0.1:8001 PYTHONPATH=. uv run python scripts/verify_pipeline.py
```

## Alembic (migrations)

```bash
# Apply latest schema
uv run alembic upgrade head

# Autogenerate a new revision after changing models in app/models/
uv run alembic revision --autogenerate -m "describe change"

# Roll back one revision
uv run alembic downgrade -1
```

`alembic/env.py` reads `DATABASE_URL` from settings and runs through an async engine. The metadata
target is `app.models.Base.metadata`; `app/models/__init__.py` imports every model so the schema is
complete.

## Docker

The image installs deps with `uv sync --frozen --no-dev`, then the entrypoint runs
`alembic upgrade head`, seeds, and finally `uvicorn`. The container listens on `8000`. Compose owns
the healthcheck (no Docker `HEALTHCHECK` is defined here).

## Layout

```
app/
  core/        # config, db engine/session, security (passwords + JWT)
  models/      # SQLAlchemy 2.0 models (Base.metadata = all tables)
  schemas/     # Pydantic v2 request/response models
  api/         # routers (all implemented) + deps
  llm/         # unified LLM interface: base + openai + anthropic + mock
  orchestrator/# turn protocol, pub/sub, sandbox client, reports, evolution
  services/    # synthesis, matching, agent helpers, JSON parsing
  seeds/       # idempotent seed runner (scenarios + NPC roster) + data
scripts/       # verify_pipeline.py (focused end-to-end check)
alembic/       # async migration env + versions
```
