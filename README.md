# Another Me

> AI digital-twin agents that socialize and work on your behalf. You "build" a
> twin from a questionnaire, dispatch it to a stylized island (an **exchange**, a
> **café**, …), then **spectate** as twins chat in strict turn-based rounds —
> complete with a **real code sandbox**, post-conversation reports, and agent
> "evolution". People only step in at the edges (define intent, read the report);
> the conversation itself is fully autonomous (inspired by "humans don't play").

This repository is a **monorepo** of four cleanly isolated services and is the
single source of truth for humans and AI coding tools alike.

- Product requirements: [`docs/brainstorms/2026-06-06-another-me-requirements.md`](docs/brainstorms/2026-06-06-another-me-requirements.md)
- **Locked API + SSE contract:** [`docs/api-contract.md`](docs/api-contract.md)

**It runs with zero API keys.** The default config uses a deterministic `mock`
LLM provider, so the entire pipeline — twin synthesis, the streamed turn
protocol, the real sandbox, reports, and evolution — works offline. Add a real
key only when you want live OpenAI/Anthropic calls (see [Real LLMs](#switching-to-a-real-llm-sc3)).

---

## Architecture

```
Another_Me/
├── README.md                 # ← you are here (single source of truth)
├── docker-compose.yml        # db + backend + frontend + sandbox-runner
├── .env.example              # all configuration (copy to .env)
├── docs/
│   ├── api-contract.md       # LOCKED REST + SSE contract
│   └── brainstorms/…         # requirements
├── backend/                  # FastAPI + async SQLAlchemy 2.0 + Alembic (uv)
│   └── app/{core,models,schemas,api,llm,orchestrator,services,seeds}
├── frontend/                 # Vite + React 19 + TS + Tailwind v4 + Motion
│   └── src/{lib,store,components,features,routes,styles}
└── sandbox-runner/           # isolated code execution (no DB / no secrets / no internet)
```

### Service & network topology (Docker Compose)

| Service          | Port (host)         | Networks                 | Notes                                                  |
| ---------------- | ------------------- | ------------------------ | ------------------------------------------------------ |
| `db`             | `5432`              | `appnet`                 | PostgreSQL 18.4, named volume `db_data`                |
| `backend`        | `8000`              | `appnet` + `sandbox_net` | FastAPI; auto-migrates + seeds on boot. **One worker** |
| `frontend`       | `5173`              | `appnet`                 | Vite dev server                                        |
| `sandbox-runner` | *(not published)*   | `sandbox_net` only       | `internal: true` ⇒ **no internet, no DB, no secrets**  |

`sandbox_net` is an `internal` Docker network shared only by `backend` and
`sandbox-runner`, which is how the sandbox is denied internet/DB access (R20 / SC4).

> **Single backend worker, by design.** Live spectating uses an in-process
> async pub/sub bus (no Redis). Run exactly one uvicorn worker — scaling workers
> would split the bus and break SSE fan-out.

### Request flow

```
Browser ──HTTP /api──▶ backend ──asyncio task──▶ turn protocol ──▶ LLM provider (mock|openai|anthropic)
   │                      │                                          │
   └──SSE /stream◀────────┘ (in-proc pub/sub bus)        agent code ─┴─▶ sandbox-runner (/run) ──▶ stdout re-injected as evidence
```

The browser talks to the backend over the **host-published port** in both
local and Compose modes (`VITE_API_BASE_URL`, default `http://localhost:8000`),
and CORS is enabled on the backend — there is no Vite dev proxy. `EventSource`
(SSE) streams are **public reads**, so they need no `Authorization` header.

---

## Tech stack (pinned 2026-06 latest)

All dependencies are pinned to exact latest stable versions — do not downgrade.

### Frontend

| Package                  | Version  |
| ------------------------ | -------- |
| react / react-dom        | 19.2.7   |
| vite                     | 8.0.16   |
| @vitejs/plugin-react     | 6.0.2    |
| typescript               | 6.0.3    |
| tailwindcss              | 4.3.0    |
| @tailwindcss/vite        | 4.3.0    |
| motion                   | 12.40.0  |
| @tanstack/react-query    | 5.101.0  |
| zustand                  | 5.0.14   |
| react-router-dom         | 7.17.0   |

### Backend

| Package           | Version  |
| ----------------- | -------- |
| fastapi           | 0.136.3  |
| uvicorn[standard] | 0.49.0   |
| sqlalchemy        | 2.0.50   |
| alembic           | 1.18.4   |
| pydantic          | 2.13.4   |
| pydantic-settings | 2.14.1   |
| asyncpg           | 0.31.0   |
| openai            | 2.41.0   |
| anthropic         | 0.106.0  |
| sse-starlette     | 3.4.4    |
| httpx             | 0.28.1   |
| PyJWT             | 2.13.0   |
| pwdlib[argon2]    | 0.3.0    |
| ruff (dev)        | 0.15.16  |

### Toolchain / infra

| Tool            | Version          |
| --------------- | ---------------- |
| Python (image)  | python:3.13-slim |
| uv              | 0.11.19          |
| Node (image)    | node:24 (LTS)    |
| PostgreSQL      | 18.4             |
| Docker Compose  | v2+              |

---

## Deploy path A — Docker Compose (recommended)

Runs all four services with one command. The backend container automatically
runs `alembic upgrade head` and seeds (4 scenarios + 12 NPC twins) on startup.

```bash
# 1. Configure (the defaults already run KEY-FREE on the mock LLM)
cp .env.example .env

# 2. Build + run everything
docker compose up --build
```

Then open:

- Frontend → http://localhost:5173
- Backend API → http://localhost:8000 (health: http://localhost:8000/health)
- Postgres → localhost:5432 (user/pass/db default `another_me`)

> **Keyless out of the box.** `.env.example` ships with `LLM_PROVIDER=mock`. Even
> if you switch it to `openai`/`anthropic` without a key, the backend logs a
> warning and **auto-falls back to mock**, so the stack always boots and the demo
> always runs.

Common commands:

```bash
docker compose up -d --build       # run in the background
docker compose logs -f backend     # tail backend logs (see migrations + seeds)
docker compose ps                  # service + health status
docker compose down                # stop (keep data)
docker compose down -v             # stop + delete the database volume
```

---

## Deploy path B — Local (without Docker)

Prerequisites: [`uv`](https://docs.astral.sh/uv/), Node 24+, and a PostgreSQL 18
instance. The quickest way to get Postgres is a one-off container:

```bash
docker run -d --name am-db \
  -e POSTGRES_USER=another_me -e POSTGRES_PASSWORD=another_me -e POSTGRES_DB=another_me \
  -p 5432:5432 postgres:18.4
```

Create your env file and point the URLs at localhost:

```bash
cp .env.example .env
# In .env, set:
#   DATABASE_URL=postgresql+asyncpg://another_me:another_me@localhost:5432/another_me
#   SANDBOX_URL=http://localhost:8001
#   LLM_PROVIDER=mock          # key-free; or set openai/anthropic + a key
```

Run the three services in three terminals (order matters: sandbox + DB first).

**Sandbox runner** (terminal 1):

```bash
cd sandbox-runner
uv sync
uv run uvicorn main:app --port 8001
```

**Backend** (terminal 2):

```bash
cd backend
uv sync                                   # resolves + installs pinned deps into .venv
export DATABASE_URL=postgresql+asyncpg://another_me:another_me@localhost:5432/another_me
export SANDBOX_URL=http://localhost:8001
export LLM_PROVIDER=mock                  # key-free demo
uv run alembic upgrade head               # create the schema
uv run python -m app.seeds.run            # idempotent: 4 scenarios + 12 NPC twins
uv run uvicorn app.main:app --reload --port 8000
```

**Frontend** (terminal 3):

```bash
cd frontend
npm install
npm run dev                               # http://localhost:5173
# VITE_API_BASE_URL defaults to http://localhost:8000; override in frontend/.env.local if needed
```

---

## Environment variables

Full reference (see [`.env.example`](.env.example) for the copy-paste template):

| Variable                       | Description                                                        | Default (dev)                                                   | Required        |
| ------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------- | --------------- |
| `LLM_PROVIDER`                 | Active LLM provider: `mock`, `openai`, or `anthropic`              | `mock`                                                        | no              |
| `LLM_MODEL`                    | Default model name                                                 | `gpt-5-mini`                                                   | no              |
| `OPENAI_MODEL`                 | Optional OpenAI model override                                     | `gpt-5-mini`                                                   | no              |
| `ANTHROPIC_MODEL`              | Optional Anthropic model override                                  | `claude-3-7-sonnet`                                           | no              |
| `OPENAI_API_KEY`               | OpenAI key (enables real OpenAI calls)                             | *(empty)*                                                      | for OpenAI      |
| `ANTHROPIC_API_KEY`            | Anthropic key (enables real Anthropic calls)                       | *(empty)*                                                      | for Anthropic   |
| `OPENAI_BASE_URL`              | Optional OpenAI base-URL override                                  | *(empty)*                                                      | no              |
| `ANTHROPIC_BASE_URL`           | Optional Anthropic base-URL override                               | *(empty)*                                                      | no              |
| `MOCK_STREAM_DELAY`            | Mock-only per-chunk SSE delay (sec) so spectating streams live     | `0.04`                                                        | no              |
| `POSTGRES_USER`                | Postgres user (Compose)                                            | `another_me`                                                   | no              |
| `POSTGRES_PASSWORD`            | Postgres password (Compose)                                        | `another_me`                                                   | no              |
| `POSTGRES_DB`                  | Postgres database (Compose)                                        | `another_me`                                                   | no              |
| `POSTGRES_PORT`                | Host port for Postgres (Compose)                                   | `5432`                                                         | no              |
| `DATABASE_URL`                 | Async SQLAlchemy URL (`db` host in Compose, `localhost` locally)   | `postgresql+asyncpg://another_me:another_me@db:5432/another_me`| no              |
| `JWT_SECRET`                   | HS256 signing secret — **change in real deployments**             | `dev-insecure-change-me`                                       | yes (prod)      |
| `JWT_ALGORITHM`                | JWT algorithm                                                      | `HS256`                                                        | no              |
| `ACCESS_TOKEN_EXPIRE_MINUTES`  | Token lifetime in minutes                                          | `10080` (7 days)                                              | no              |
| `MAX_ROUNDS`                   | Default per-agent max conversation rounds                          | `8`                                                           | no              |
| `MAX_CONCURRENT_CONVERSATIONS` | Max simultaneously running conversations                           | `4`                                                           | no              |
| `SANDBOX_URL`                  | Backend → sandbox-runner URL                                       | `http://sandbox-runner:8001`                                  | no              |
| `SANDBOX_TIMEOUT_SECONDS`      | Hard wall-clock timeout per sandbox run                            | `10`                                                          | no              |
| `VITE_API_BASE_URL`            | Browser → backend base URL                                         | `http://localhost:8000`                                       | no              |
| `CORS_ORIGINS`                 | Comma-separated allowed origins, or `*`                            | `*`                                                           | no              |
| `BACKEND_PORT` / `FRONTEND_PORT` | Host port overrides (Compose)                                   | `8000` / `5173`                                              | no              |

### Switching to a real LLM (SC3)

The demo runs on the deterministic `mock` provider with **no key**. To use real
models instead, set the provider and supply the matching key in `.env`, then
restart:

```bash
# OpenAI (Responses API)
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-5-mini          # any model your key can access

# …or Anthropic (Messages API)
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
LLM_MODEL=claude-3-7-sonnet
```

```bash
docker compose up -d --build   # (Compose) pick up the new .env
```

Provider is selected at runtime by `LLM_PROVIDER` / `LLM_MODEL`. If the selected
real provider's key is missing, the backend logs a warning and falls back to
`mock` so the stack still boots.

---

## Demo script (3–5 minutes)

Run on the keyless `mock` provider. Register once (top-right), then:

### Scenario 1 — 交易所 / Exchange (business + real sandbox, AE4)

1. **Build a twin** → name it (e.g. *Nova Chen*), pick **fintech**, a couple of
   traits (*direct, driven*), and **paste/upload a Skill** (e.g. a growth model).
   Create it. The server synthesizes a persona, rules, and profile tags.
2. **Dispatch** → choose the **交易所 (Exchange)** building, write a task
   ("Pitch a fintech idea and defend the growth numbers with live data."), and
   leave the opponent on **Profile match** → it pairs an **investor** NPC.
3. **Spectate**: watch the two twins talk turn-by-turn over SSE (no input box —
   you only observe). Mid-conversation the founder **runs code in the sandbox**
   and a distinct **evidence bubble** shows the real `stdout` (growth / LTV·CAC).
4. When it ends, open the **商业评估 / Business report** (feasibility, risks,
   valuation lean, recommendation, highlights).
5. Switch to the **Evolution** tab to see the proposed persona/skills **diff**,
   then **Apply** (the twin's persona updates) and **Roll back**.

### Scenario 3 — 咖啡馆 / Café (cross-industry empathy, AE3)

1. **Build** a second twin from a very different walk of life (e.g. a small-town
   teacher: *warm, patient*; domain *education*).
2. **Dispatch** → the **咖啡馆 (Café)** building with **Profile match** (it
   prefers a *different* background for cross-industry empathy). No sandbox here.
3. **Spectate** the conversation, then open the **见闻共情 / Empathy report**
   (common ground, emotional insights, takeaways) — a different dialect than the
   exchange's business report (same engine, scenario-driven).

> Tip: the **island** home page shows live "tables" for every conversation;
> click one to jump back into spectating or its report.

---

## API surface

The complete, **locked** contract lives in [`docs/api-contract.md`](docs/api-contract.md).
All routes below are **implemented** (shapes are final):

- `GET /health`
- **Auth:** `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- **Agents:** create-from-questionnaire, search/list, get, fork, patch (`/api/agents…`)
- **Scenarios:** `GET /api/scenarios`, `GET /api/scenarios/{id_or_key}`
- **Dispatches:** `POST /api/dispatches` (profile match / by-id / open seat; auto-starts the conversation), list, get
- **Conversations:** list, get (+participants), `GET /api/conversations/{id}/messages` (transcript)
- **SSE spectating:** `GET /api/conversations/{id}/stream` — public read; events `message-start`, `message-delta`, `message-end`, `sandbox-output`, `conversation-end`, `ping`
- **Reports:** `GET /api/conversations/{id}/report`, `GET /api/reports/{id}`
- **Evolutions:** `GET /api/evolutions?agent_id=…`, `POST /api/evolutions/{id}/apply` (apply/rollback)
- **Marketplace:** list, create, fork, points
- **Sandbox (internal):** `POST /run` on the sandbox-runner service

### How a conversation runs

- `n = min(participants' max_rounds)`; the dialogue is `2n` turns with **strict
  alternation** (agent1 on odd turns, agent2 on even). When two rounds remain,
  the scenario's **ending prompt** is injected to wind the conversation down
  (R12–R14 / AE1).
- Each turn is persisted and streamed over SSE. In **business** scenarios the
  acting twin may emit a `python` block, which the backend runs in the isolated
  **sandbox-runner** and re-injects as a `sandbox-output` evidence row (R19 / AE4).
- On completion the engine writes a scenario-specific **report**
  (exchange → business, café → empathy; R16 / AE3) and a per-twin **evolution**
  diff you can apply or roll back (R18).

---

## Status & verification

Implemented and verified end-to-end on the `mock` provider (no keys):

- ✅ Build-a-twin (questionnaire → persona/rules/tags + uploaded skills)
- ✅ Dispatch with profile matching / direct-id / open seat; conversation auto-starts
- ✅ Live SSE spectating with the locked event protocol (verified over the wire)
- ✅ Real sandbox execution + `sandbox-output` re-injection (AE4)
- ✅ Business vs empathy report dialects (AE3); evolution apply/rollback (R18)
- ✅ Turn protocol `n=min`, strict alternation, ending-prompt injection (AE1)
- ✅ Both deploy paths (Docker Compose + local) boot healthy; `tsc` + `vite build` green

### Known limitations (hackathon scope)

- **Single backend worker** — live streaming uses an in-process bus; do not scale
  workers (you'd split the SSE fan-out).
- **Real LLM (SC3) needs a key** — the demo and all checks above run on the
  deterministic `mock` provider. Add a key to exercise OpenAI/Anthropic.
- **Sandbox isolation is hackathon-grade** — container + internal-only network +
  dropped caps + read-only FS + mem/CPU/pids caps + wall-clock timeout; not a
  production-hardened multi-tenant jail.
- **Frontend ships one JS bundle** (~605 kB / ~184 kB gzip). Fine for a local
  demo; route-level code-splitting is a future optimization.
- **v1 is 1:1 conversations**; group chat (>2 twins) and the lab / Coding Club
  scenarios are placeholders.

---

## License

Hackathon project — internal use.
