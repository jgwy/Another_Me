# 觅见.AI (Another Me) — API Contract

> This document is the **single source of truth** for the REST + SSE surface of 觅见.AI.
> The foundation agent locks it; the **backend-features** agent implements it **exactly**, and the
> **frontend-features** agent consumes it **exactly**. Object shapes here are aligned 1:1 with the
> SQLAlchemy models (`backend/app/models/`) and Pydantic schemas (`backend/app/schemas/`).
>
> Endpoints marked **STUB** return `501 Not Implemented` and are filled in by later workstreams.
> Their request/response shapes are nonetheless final — do not change them.

> **Refactor status (Phase 1 / foundation).** The original v1 surfaces (auth, agents, scenarios,
> dispatches, conversations + SSE, reports, evolutions, marketplace) are **implemented**. Phase 1
> additionally:
> - extended **Agent** with a structured `prompt_config` brain (see [PromptConfig](#promptconfig)),
> - **locked** the new refactor contracts as final shapes with **STUB (501)** endpoints, ready for the
>   parallel backend/frontend workstreams to fill in (and to add their own models/migrations on top of
>   migration head `92740f62549b`): `POST /api/agents/generate` (§3), standalone **Skill v2** (§4),
>   **Marketplace v2** versioning/likes (§4), **Trips** (§6), **Inbox/notifications** (§7), and the
>   **Relationship graph** (§8).
>
> Where a v2 object adds fields to a v1 object (Agent, Skill, MarketplaceItem) the new fields are
> **additive and optional** (defaulted) so existing rows/clients keep working until the owning
> workstream migrates the model and backfills.

> **Refactor-2 status (foundation locked).** Migration head is now **`06e68300418b`**. This foundation
> shipped the schema + a single additive migration and **locked** these new contracts as final shapes
> with **STUB (501)** endpoints for the parallel backend/frontend workstreams to fill:
> - **Scenario** gains `owner_id` / `is_public` and a documented `meta` (map/visual/plaza) shape;
>   `POST /api/scenarios` (user-created) + plaza **presence** (`enter`/`leave`/`presence`/`stream`, §3.4 + SSE §4.3).
> - **Skill** gains `skill_md` / `manifest` / `resources` (Anthropic-style packs); `POST /api/skills/import` (.zip → SKILL.md).
> - new **McpServer** model + `/api/mcps` CRUD + `connect` (§3.15), ported from Xyzen.
> - **Trip** default duration now reads `TRIP_DURATION_SECONDS` (demo fast / prod long).

---

## 1. Conventions

| Aspect | Rule |
| --- | --- |
| Base URL | Configured via `VITE_API_BASE_URL` on the client (e.g. `http://localhost:8000`). |
| App routes | All application endpoints are under `/api`. |
| Health | `GET /health` lives at the root (no `/api` prefix) for container healthchecks. |
| Auth | `Authorization: Bearer <jwt>` header. JWT is HS256, signed with `JWT_SECRET`. |
| JWT claims | `{ "sub": "<user_id>", "iat": <int>, "exp": <int> }`. Expiry = `ACCESS_TOKEN_EXPIRE_MINUTES`. |
| Content type | Request + response bodies are `application/json` (except SSE = `text/event-stream`). |
| IDs | All IDs are UUID v4 **strings**. |
| Timestamps | ISO-8601 UTC strings, e.g. `2026-06-06T12:34:56.789Z`. |
| Casing | JSON keys are `snake_case`. |
| Pagination | List endpoints accept `?limit=` (default 20, max 100) and `?offset=` (default 0). |
| List envelope | Paginated lists return `{ "items": [...], "total": <int>, "limit": <int>, "offset": <int> }`. Bounded lists (scenarios, messages, participants, evolutions) return a plain JSON array. |

### Standard error shape

```json
{ "detail": "Human readable message" }
```

Validation errors (FastAPI / Pydantic, HTTP 422):

```json
{ "detail": [ { "loc": ["body", "email"], "msg": "field required", "type": "missing" } ] }
```

### Status codes used

| Code | Meaning |
| --- | --- |
| 200 | OK |
| 201 | Created |
| 204 | No Content |
| 400 | Bad request (validation/business rule) |
| 401 | Missing/invalid token |
| 403 | Authenticated but not allowed (e.g. not the owner) |
| 404 | Not found |
| 409 | Conflict (e.g. email/username already taken) |
| 422 | Request body failed schema validation |
| 500 | Unexpected server error |
| 501 | **STUB** — endpoint reserved, not implemented yet |
| 503 | Resource not ready (e.g. report still generating) or sandbox unavailable |

---

## 2. Data Objects

Field type notation: `string`, `int`, `bool`, `uuid` (string), `datetime` (ISO string), `object`
(free-form JSON), `T[]` (array), `T?` (nullable).

### User

```json
{
  "id": "uuid",
  "email": "string",
  "username": "string",
  "points": 100,
  "created_at": "datetime"
}
```

> `password_hash` is **never** serialized.

### AuthResponse (register / login)

```json
{
  "access_token": "jwt-string",
  "token_type": "bearer",
  "user": { "...User": "..." }
}
```

### Skill (v2 — standalone structured capability pack)

```json
{
  "id": "uuid",
  "agent_id": "uuid?",
  "owner_id": "uuid",
  "name": "string",
  "description": "string",
  "prompt_body": "string",
  "content": "string",
  "skill_md": "string",
  "manifest": { "name": "string", "description": "string", "version": "string", "triggers": ["string"] },
  "resources": [ { "path": "string", "kind": "string", "ref": "string", "size": 0 } ],
  "params": [ { "...SkillParam": "..." } ],
  "tags": ["string"],
  "executable": { "kind": "none | script | mcp", "ref": "string?", "config": {} },
  "source": "questionnaire | upload | evolved | generated | selected",
  "is_public": false,
  "created_at": "datetime",
  "updated_at": "datetime?"
}
```

> `prompt_body` is the canonical capability text. `content` is the **deprecated v1 alias** kept during
> migration: the server keeps the two mirrored, so clients may read either (prefer `prompt_body`).
> `agent_id == null` ⇒ a **standalone/library** skill. `executable` is a **reserved hook** (not executed
> this round). `params`, `tags`, `description`, `is_public`, `executable`, `updated_at` are v2 fields.
> **Skill packs (refactor-2):** `skill_md` is the raw `SKILL.md` body (Anthropic-style), `manifest` is
> its parsed frontmatter (`name`/`description`/`version`/`triggers`), and `resources` is the packaged
> file manifest from the imported `.zip`. They are populated by `POST /api/skills/import`; `prompt_body`
> is **derived** from `SKILL.md` (frontmatter stripped). `skill_md` defaults to `""`; `manifest` /
> `resources` are `null` for skills not created from a pack.

### SkillParam

```json
{
  "name": "string",
  "type": "string | number | boolean | enum",
  "label": "string?",
  "required": false,
  "default": "any?",
  "options": ["string"],
  "description": "string?"
}
```

### AgentSummary (nested in participants / lists where lightweight)

```json
{ "id": "uuid", "name": "string", "avatar": "string?", "profile_tags": ["string"] }
```

### Agent

```json
{
  "id": "uuid",
  "owner_id": "uuid",
  "name": "string",
  "persona": "string",
  "rules": { "tone": "string", "dos": ["string"], "donts": ["string"] },
  "prompt_config": { "...PromptConfig": "..." },
  "profile_tags": ["string"],
  "questionnaire": { "any": "json" },
  "avatar": "string?",
  "max_rounds": 8,
  "is_public": false,
  "forked_from": "uuid?",
  "source_version": "int?",
  "skills": [ { "...Skill": "..." } ],
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

> `prompt_config` is the structured social-twin **brain** (the primary thing the prompt builder
> consumes). It is `{}` for legacy agents (the builder then falls back to `persona`/`rules`/`profile_tags`
> and still applies the anti-leak guardrails). `persona`/`rules` are kept for back-compat/display.
> `source_version` (Marketplace v2) records which listing version this agent was forked from.

### PromptConfig

Stored on `Agent.prompt_config` (JSONB). Behavioral by design (the twin **embodies** a real person; it
never recites a third-person "character sheet"). This is also the shape returned by
`POST /api/agents/generate` and edited by the create/tune dual-mode editor (guided form ↔ raw JSON).

```json
{
  "version": "1.0",
  "identity": {
    "name": "string",
    "one_liner": "string",
    "background": "string",
    "age_range": "string?",
    "location": "string?",
    "pronouns": "string?"
  },
  "voice": {
    "tone": "string",
    "speaking_style": ["string"],
    "catchphrases": ["string"],
    "formality": "casual | neutral | formal",
    "emoji": false
  },
  "values": {
    "core_values": ["string"],
    "dos": ["string"],
    "donts": ["string"],
    "boundaries": ["string"]
  },
  "interests": {
    "passions": ["string"],
    "expertise": ["string"],
    "curiosities": ["string"],
    "dislikes": ["string"]
  },
  "memory_hooks": {
    "signature_stories": ["string"],
    "relationships": ["string"],
    "recent_context": ["string"],
    "goals": ["string"]
  },
  "security": {
    "identity_integrity": true,
    "instruction_protection": true,
    "injection_defense": true,
    "stay_in_character": true,
    "forbidden_reveals": ["string"]
  }
}
```

> `security` drives the hardened anti-leak XML guardrail blocks injected into the system prompt
> (`<IDENTITY_INTEGRITY>`, `<INSTRUCTION_PROTECTION>`, `<PERSONA_EMBODIMENT>`). `forbidden_reveals`
> defaults to model/provider names plus the meta-vocabulary a real person would never say (`AI`,
> `语言模型`, `人设`, `提示词`, `prompt`, …). See `app/orchestrator/prompts.py`.

### Scenario

```json
{
  "id": "uuid",
  "key": "exchange | cafe | lab | coding_club | <user-slug>",
  "name": "string",
  "description": "string",
  "kind": "business | empathy | generic",
  "topics": ["string"],
  "scene_prompt": "string",
  "ending_prompt": "string",
  "is_full": true,
  "owner_id": "uuid?",
  "is_public": true,
  "meta": {
    "building": "string",
    "x": 0,
    "y": 0,
    "category": "string",
    "report_dialect": "string",
    "visual": { "sprite": "string?", "palette": "string?", "icon": "string?" },
    "plaza": { "width": 0, "height": 0, "spawn": [ { "x": 0, "y": 0 } ], "props": [] }
  },
  "created_at": "datetime"
}
```

> `kind` drives report dialect: `exchange → business`, `cafe → empathy`. `lab`/`coding_club` are
> placeholders (`is_full: false`). **Refactor-2:** `owner_id == null` ⇒ a built-in/**system** scenario;
> otherwise it is **user-created**. `is_public` controls listing visibility (system seeds default
> `true`). `meta` is free-form; every key above is **optional** and the 2.5D world renderer falls back to
> defaults — `x`/`y` place the building on the 0..100 island grid, `category` buckets it
> (`business|social|health|art|…`), and `plaza` describes the per-scenario presence stage.

### Dispatch

```json
{
  "id": "uuid",
  "agent_id": "uuid",
  "scenario_id": "uuid",
  "task_prompt": "string",
  "opponent_agent_id": "uuid?",
  "match_by_profile": false,
  "status": "queued | matched | running | completed | failed | cancelled",
  "created_by": "uuid",
  "conversation_id": "uuid?",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### Conversation

```json
{
  "id": "uuid",
  "scenario_id": "uuid",
  "status": "pending | running | completed | failed",
  "n_rounds": 5,
  "title": "string?",
  "participants": [ { "...Participant": "..." } ],
  "created_at": "datetime",
  "started_at": "datetime?",
  "ended_at": "datetime?"
}
```

### Participant

```json
{
  "id": "uuid",
  "conversation_id": "uuid",
  "agent_id": "uuid",
  "seat": 1,
  "role": "string?",
  "agent": { "...AgentSummary": "..." }
}
```

> `seat` is `1` (agent1) or `2` (agent2). Unique per `(conversation_id, seat)`.

### Message

```json
{
  "id": "uuid",
  "conversation_id": "uuid",
  "seq": 0,
  "turn_index": 1,
  "agent_id": "uuid?",
  "sender": "agent | system | sandbox",
  "content": "string",
  "meta": { "any": "json" },
  "created_at": "datetime"
}
```

> `seq` is a 0-based monotonic order key, unique per conversation (covers agent + system + sandbox
> rows). `turn_index` is the 1-based dialogue number `[对话k]` (1..2n) for `sender == "agent"`, and
> `null` for `system`/`sandbox` rows. Sandbox evidence rows put run details in `meta`.

### Report

```json
{
  "id": "uuid",
  "conversation_id": "uuid",
  "kind": "business | empathy | generic",
  "summary": "string",
  "content": { "any": "json" },
  "created_at": "datetime"
}
```

> Suggested `content` shapes (finalized by reports-evolution agent):
> - business: `{ "feasibility": "...", "risks": ["..."], "valuation_lean": "...", "recommendation": "...", "highlights": ["..."] }`
> - empathy: `{ "common_ground": ["..."], "emotional_insights": ["..."], "takeaways": ["..."] }`

### Evolution

```json
{
  "id": "uuid",
  "agent_id": "uuid",
  "conversation_id": "uuid?",
  "diff": { "persona": { "before": "...", "after": "..." }, "skills_added": [], "rules": {} },
  "applied": false,
  "created_at": "datetime",
  "applied_at": "datetime?"
}
```

### SandboxRun

```json
{
  "id": "uuid",
  "conversation_id": "uuid?",
  "agent_id": "uuid?",
  "message_id": "uuid?",
  "language": "python",
  "code": "string",
  "stdout": "string",
  "stderr": "string",
  "exit_code": 0,
  "duration_ms": 0,
  "created_at": "datetime"
}
```

### MarketplaceItem (v2 — versioned + social)

```json
{
  "id": "uuid",
  "kind": "agent | skill",
  "ref_id": "uuid",
  "owner_id": "uuid",
  "title": "string",
  "description": "string?",
  "price_points": 0,
  "version": 1,
  "fork_mode": "editable | locked",
  "likes": 0,
  "forks": 0,
  "views": 0,
  "downloads": 0,
  "snapshot": { "any": "json" },
  "created_at": "datetime",
  "updated_at": "datetime?"
}
```

> v2 fields (`version`, `fork_mode`, `likes`, `forks`, `views`, `snapshot`, `updated_at`) are additive
> and default until the skills-market workstream migrates the model. `downloads` is the **v1 alias of
> `forks`**. `fork_mode = locked` ⇒ forks get a hidden, non-editable config (mirrors Xyzen); `editable`
> ⇒ forks may view/edit. `snapshot` is the immutable content of the latest published version.

### MarketplaceVersion (immutable published snapshot)

```json
{
  "id": "uuid",
  "item_id": "uuid",
  "version": 1,
  "snapshot": { "any": "json" },
  "changelog": "string?",
  "created_at": "datetime"
}
```

### McpServer (refactor-2 — MCP tool server, ported from Xyzen)

```json
{
  "id": "uuid",
  "owner_id": "uuid",
  "agent_id": "uuid?",
  "name": "string",
  "description": "string",
  "category": "string",
  "transport": "stdio | sse | http",
  "command": "string?",
  "url": "string?",
  "config": { "any": "json" },
  "status": "unknown | online | offline | error",
  "tools": [ { "name": "string", "description": "string", "inputSchema": {} } ],
  "is_public": false,
  "last_checked_at": "datetime?",
  "created_at": "datetime",
  "updated_at": "datetime?"
}
```

> A registered MCP server the **sandbox** connects to so its tools can be invoked during encounters.
> `agent_id == null` ⇒ a library/standalone server; otherwise it is attached to that agent. Provide
> `command` for `stdio` transport, or `url` for `sse`/`http`. **Secrets are write-only:** the create/patch
> bodies accept a `token` (Xyzen-compatible) and may carry secrets in `config`, but `token` is **never
> serialized** and `config` is **sanitized** in responses. `status`/`tools`/`last_checked_at` are filled
> by the connect/probe logic (Phase 2).

### McpConnectResponse

```json
{ "id": "uuid", "status": "online | offline | error", "tools": [ { "...tool": "..." } ], "error": "string?" }
```

### Trip (§6 — autonomous multi-encounter journey)

```json
{
  "id": "uuid",
  "agent_id": "uuid",
  "created_by": "uuid",
  "task_prompt": "string",
  "status": "planning | traveling | in_encounter | returning | completed | failed | cancelled",
  "agent_status": "idle | thinking | departing | traveling | meeting | talking | returning | home",
  "plan": { "...TripPlan": "..." },
  "duration_seconds": 0,
  "encounters": [ { "...TripEncounter": "..." } ],
  "summary_report_id": "uuid?",
  "agent": { "...AgentSummary?": "..." },
  "started_at": "datetime?",
  "ended_at": "datetime?",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

> One dispatch = one Trip. The autonomous planner picks scenes and (explainably) matches opponents,
> then the twin travels through **2–4 encounters** over `duration_seconds` (default from the
> `TRIP_DURATION_SECONDS` env — demo fast / prod long). The world map renders the journey live from
> `status` / `agent_status`.

### TripPlan / TripStop

```json
{ "summary": "string", "stops": [ { "...TripStop": "..." } ] }
```
```json
{
  "scenario_id": "uuid?",
  "scenario_key": "string?",
  "opponent_agent_id": "uuid?",
  "reasons": ["string"],
  "risks": ["string"]
}
```

### TripEncounter

```json
{
  "id": "uuid",
  "trip_id": "uuid",
  "seq": 0,
  "scenario_id": "uuid",
  "scenario_key": "string?",
  "opponent_agent_id": "uuid?",
  "conversation_id": "uuid?",
  "status": "pending | running | completed | failed | skipped",
  "match_reasons": ["string"],
  "match_risks": ["string"],
  "report_id": "uuid?",
  "postcard": { "any": "json" },
  "opponent": { "...AgentSummary?": "..." },
  "created_at": "datetime"
}
```

> `postcard` is a lightweight souvenir / reusable takeaway from the encounter. Each encounter's live
> dialogue is spectated via the existing conversation SSE (`conversation_id`).

### Notification (§7 — inbox)

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "kind": "trip_completed | encounter_completed | report_ready | postcard | relationship_update | marketplace | system",
  "title": "string",
  "body": "string?",
  "read": false,
  "data": { "trip_id": "uuid?", "encounter_id": "uuid?", "conversation_id": "uuid?", "report_id": "uuid?", "agent_id": "uuid?", "item_id": "uuid?" },
  "created_at": "datetime",
  "read_at": "datetime?"
}
```

### Relationship (§8)

```json
{
  "id": "uuid",
  "owner_id": "uuid",
  "from_agent_id": "uuid",
  "to_agent_id": "uuid",
  "strength": 0.0,
  "type": "ally | mentor | rival | friend | acquaintance | collaborator | ...",
  "label": "string?",
  "encounters_count": 0,
  "last_conversation_id": "uuid?",
  "from_agent": { "...AgentSummary?": "..." },
  "to_agent": { "...AgentSummary?": "..." },
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

> A directed tie updated after each encounter; `strength` accumulates in `0..1`. Across trips this
> forms a densifying social network.

### RelationshipGraph

```json
{
  "nodes": [ { "agent": { "...AgentSummary": "..." }, "owned": false } ],
  "edges": [ { "...Relationship": "..." } ]
}
```

### PresenceEntry (refactor-2 — plaza presence)

```json
{
  "agent_id": "uuid",
  "user_id": "uuid?",
  "agent": { "...AgentSummary?": "..." },
  "kind": "user | npc",
  "status": "idle | walking | talking",
  "x": 0.0,
  "y": 0.0,
  "joined_at": "datetime?",
  "last_seen": "datetime?"
}
```

> One agent currently present in a scenario's plaza. `x`/`y` are plaza coordinates on the 0..100 grid
> (the 2.5D world). `kind = npc` for seeded/system NPCs (no `user_id`).

### PresenceSnapshot

```json
{ "scenario_id": "uuid", "count": 0, "entries": [ { "...PresenceEntry": "..." } ] }
```

---

## 3. Endpoints

Legend: 🔓 public · 🔑 requires Bearer JWT · 🟡 **STUB** (501, contract final) · 🟢 implemented.

### 3.1 Health

#### `GET /health` 🔓 🟢
- **200**
```json
{ "status": "ok", "service": "backend", "time": "datetime" }
```

### 3.2 Auth — 🟢 implemented in foundation

#### `POST /api/auth/register` 🔓
- **Request**
```json
{ "email": "a@b.com", "username": "alice", "password": "secret123" }
```
- **201** → `AuthResponse`
- **409** email or username already taken · **422** validation

#### `POST /api/auth/login` 🔓
- **Request**
```json
{ "email": "a@b.com", "password": "secret123" }
```
- **200** → `AuthResponse`
- **401** invalid credentials

#### `GET /api/auth/me` 🔑
- **200** → `User`
- **401** missing/invalid token

### 3.3 Agents — 🟢 implemented  (Phase 1 added `prompt_config`; `generate` now implemented)

#### `POST /api/agents` 🔑
Create from questionnaire, optionally merging uploaded/selected skills. Server synthesizes
`persona` / `rules` / `profile_tags` **and a structured `prompt_config` brain** (or uses a client-
supplied `prompt_config` draft when provided).
- **Request**
```json
{
  "name": "My Twin",
  "questionnaire": { "domain": "fintech", "personality": ["curious"], "goals": "..." },
  "uploaded_skills": [ { "name": "DCF model", "prompt_body": "...", "content": "..." } ],
  "prompt_config": { "...PromptConfig?": "..." },
  "skill_ids": ["uuid"],
  "max_rounds": 8,
  "is_public": false,
  "avatar": "string?"
}
```
- `prompt_config` (optional): a hand-tuned/generated brain; when omitted the server synthesizes one.
- `skill_ids` (optional): standalone/library skills (owned by the caller or unattached) to attach to the new agent.
- **201** → `Agent`

#### `GET /api/agents` 🔓
Search/list by profile + tags.
- **Query:** `q` (free text over name/persona/tags), `tags` (comma-separated, AND), `owner` (`me` or `<uuid>`), `is_public` (bool), `limit`, `offset`.
- **200** → `{ items: Agent[], total, limit, offset }`

#### `GET /api/agents/{id}` 🔓
- **200** → `Agent` · **404**

#### `POST /api/agents/{id}/fork` 🔑
Clone an agent (must be public or owned) to the caller; sets `forked_from`.
- **Request** (optional)
```json
{ "name": "Forked Twin" }
```
- **201** → `Agent` · **403** not allowed · **404**

#### `PATCH /api/agents/{id}` 🔑 (owner only)
Tuning dual-mode: edit guided fields **or** the raw `prompt_config` JSON.
- **Request** (all optional)
```json
{ "name": "...", "persona": "...", "rules": {}, "prompt_config": { "...PromptConfig": "..." }, "profile_tags": ["..."], "max_rounds": 6, "is_public": true, "avatar": "..." }
```
- **200** → `Agent` · **403** not owner · **404**

#### `POST /api/agents/generate` 🔑 🟢 (§3)
Draft a `prompt_config` (the social-twin brain) from natural language or a personal corpus —
**no persistence**; the client reviews/tweaks the draft, then `POST /api/agents` with it.
- **Request**
```json
{
  "mode": "nl | corpus",
  "input": "free-form description (nl) OR pasted chats/writing to distill (corpus)",
  "name": "string?",
  "context": { "any": "json" }
}
```
- **200** → `AgentGenerateResponse`
```json
{
  "name": "string",
  "prompt_config": { "...PromptConfig": "..." },
  "persona": "string",
  "rules": {},
  "profile_tags": ["string"],
  "skills": [ { "name": "string", "content": "string" } ],
  "questions": ["string"]
}
```
- `questions`: skill-creator-style clarifying follow-ups (may be empty when confident).

### 3.4 Scenarios — 🟢 implemented (refactor-2 adds 🟡 create + presence)

#### `GET /api/scenarios` 🔓
- **200** → `Scenario[]`
- Refactor-2: the scenarios-open workstream adds optional filters `category`, `owner` (`me`|uuid),
  `is_public` and visibility (public OR owned) — additive query params; the array shape is unchanged.

#### `GET /api/scenarios/{id_or_key}` 🔓
Accepts either the scenario UUID or its `key` (e.g. `exchange`).
- **200** → `Scenario` · **404**

#### `POST /api/scenarios` 🔑 🟡 (refactor-2 §2)
Create a user-owned scenario. The server slugifies a unique `key`, stamps `owner_id = caller`, and
merges `category` into `meta`.
- **Request** → `ScenarioCreate`
```json
{
  "name": "读书会",
  "description": "string?",
  "kind": "business | empathy | generic",
  "topics": ["string"],
  "scene_prompt": "string?",
  "ending_prompt": "string?",
  "category": "string?",
  "key": "string?",
  "is_public": true,
  "meta": { "any": "json" }
}
```
- **201** → `Scenario` · **409** key already taken · **422** validation

#### `POST /api/scenarios/{id}/enter` 🔑 🟡 (refactor-2 §3/§6)
Mark the caller's agent present in the scenario plaza (heartbeat upsert).
- **Request** → `PresenceEnterRequest`
```json
{ "agent_id": "uuid", "x": 0.0, "y": 0.0 }
```
- **200** → `PresenceEntry` · **403** agent not owned · **404** scenario/agent

#### `POST /api/scenarios/{id}/leave` 🔑 🟡 (refactor-2 §3/§6)
- **Request** → `PresenceLeaveRequest`
```json
{ "agent_id": "uuid" }
```
- **200** → `{ "scenario_id": "uuid", "agent_id": "uuid", "left": true }` · **404**

#### `GET /api/scenarios/{id}/presence` 🔓 🟡 (refactor-2 §3/§6)
Snapshot of who is present in the plaza right now.
- **200** → `PresenceSnapshot` · **404**

#### `GET /api/scenarios/{id}/stream` 🔓 (SSE) 🟡 (refactor-2 §3/§6)
Per-scenario presence channel for the 2.5D plaza (read-only). Events in §4.3.
- **404** scenario not found

### 3.5 Dispatches — 🟢 implemented

> Legacy 1:1 path (agent enters one scenario vs one opponent; auto-starts a conversation). The new
> autonomous **Trips** flow (§3.11) supersedes this for the refactor; dispatches remain for compat.

#### `POST /api/dispatches` 🔑
Create a dispatch: an agent enters a scenario with a task prompt; optionally name a direct opponent
or request profile matching.
- **Request**
```json
{
  "agent_id": "uuid",
  "scenario_id": "uuid",
  "task_prompt": "Pitch a fintech idea and defend the numbers.",
  "opponent_agent_id": "uuid?",
  "match_by_profile": false
}
```
- **201** → `Dispatch` · **404** agent/scenario not found · **403** agent not owned

#### `GET /api/dispatches` 🔑
Caller's dispatches.
- **Query:** `status`, `agent_id`, `limit`, `offset`.
- **200** → `{ items: Dispatch[], total, limit, offset }`

#### `GET /api/dispatches/{id}` 🔑
- **200** → `Dispatch` · **404**

### 3.6 Conversations — 🟢 implemented (SSE shape final)

#### `GET /api/conversations` 🔓
- **Query:** `scenario_id`, `agent_id`, `status`, `limit`, `offset`.
- **200** → `{ items: Conversation[], total, limit, offset }`

#### `GET /api/conversations/{id}` 🔓
- **200** → `Conversation` (with `participants`) · **404**

#### `GET /api/conversations/{id}/messages` 🔓
- **Query:** `after_seq` (return messages with `seq > after_seq`), `limit`.
- **200** → `Message[]` (ascending `seq`)

#### `GET /api/conversations/{id}/stream` 🔓 (SSE)
Server-Sent Events stream for live spectating (**no input** — read-only, per R10).
- **Headers:** `Content-Type: text/event-stream`.
- **Auth:** public for public conversations. Because `EventSource` cannot send headers, a token may be
  passed as `?token=<jwt>` for private conversations. Foundation treats the stream as public.
- **Reconnect:** each event carries an SSE `id:` equal to the message `seq`; clients may resume with
  `Last-Event-ID`. A `ping` event is emitted every ~15s as keepalive.
- **Events** (see §4 for payloads): `message-start`, `message-delta`, `message-end`,
  `sandbox-output`, `conversation-end`, `ping`.

### 3.7 Reports — 🟢 implemented

#### `GET /api/conversations/{id}/report` 🔓  (canonical)
- **200** → `Report`
- **404** conversation not found · **503** report not generated yet

#### `GET /api/reports/{report_id}` 🔓 (convenience)
- **200** → `Report` · **404**

### 3.8 Evolutions — 🟢 implemented

#### `GET /api/evolutions?agent_id=<uuid>` 🔑
List evolutions for an agent (newest first). Evolutions are **created by the system** after a
conversation; clients list and apply/rollback them.
- **200** → `Evolution[]` · **400** missing `agent_id`

#### `POST /api/evolutions/{id}/apply` 🔑 (owner of the agent)
Apply or roll back an evolution diff onto the agent.
- **Request** (optional)
```json
{ "applied": true }
```
- **200** → `Evolution` · **403** not owner · **404**

### 3.9 Marketplace — 🟢 implemented (v1 + v2 versioning/likes)

#### `GET /api/marketplace` 🔓
- **Query:** `kind` (`agent`|`skill`), `q`, `sort` (`downloads`|`recent`; v2 also `likes`), `limit`, `offset`.
- **200** → `{ items: MarketplaceItem[], total, limit, offset }`

#### `POST /api/marketplace` 🔑
List an owned agent or skill on the marketplace.
- **Request**
```json
{ "kind": "agent", "ref_id": "uuid", "title": "Sharp VC Twin", "description": "string?", "price_points": 0, "fork_mode": "editable | locked" }
```
- **201** → `MarketplaceItem` · **403** not owner of `ref_id` · **404**

#### `POST /api/marketplace/{id}/fork` 🔑
Fork/clone the referenced agent/skill to the caller; increments `downloads`; adjusts points
(simulated economy).
- **201**
```json
{ "item": { "...MarketplaceItem": "..." }, "agent": { "...Agent?": "..." }, "skill": { "...Skill?": "..." }, "source_version": "int?" }
```
- **402-like handling:** insufficient points → **400** `{ "detail": "not enough points" }` · **404**

> v2: a fork records `source_version` on the cloned agent/skill for lineage sync, and respects the
> listing's `fork_mode` (`locked` ⇒ the fork's config is hidden + non-editable).

#### `GET /api/marketplace/points` 🔑
Caller's simulated points balance (mirror of `User.points`).
- **200** → `{ "user_id": "uuid", "points": 100 }`

#### `POST /api/marketplace/{id}/like` 🔑 🟢 (v2)
Toggle the caller's like on a listing.
- **200** → `{ "item_id": "uuid", "likes": 0, "liked": true }` · **404**

#### `GET /api/marketplace/{id}/versions` 🔓 🟢 (v2)
List a listing's immutable published versions (newest first).
- **200** → `MarketplaceVersion[]` · **404**

#### `POST /api/marketplace/{id}/publish` 🔑 (owner) 🟢 (v2)
Freeze the current source (agent/skill) as a new immutable version; bumps `version`.
- **Request**
```json
{ "changelog": "string?" }
```
- **201** → `MarketplaceItem` · **403** not owner · **404**

### 3.10 Skills (standalone, v2) — 🟢 implemented (§4)

Structured, reusable capability packs. `agent_id == null` ⇒ a library skill.

#### `POST /api/skills` 🔑
- **Request** → `SkillCreate`
```json
{ "name": "string", "description": "string?", "prompt_body": "string", "params": [], "tags": ["string"], "executable": { "kind": "none" }, "agent_id": "uuid?", "is_public": false, "source": "upload" }
```
- **201** → `Skill`

#### `POST /api/skills/import` 🔑 🟡 (refactor-2 §5)
Import a skill from a `.zip` pack (**`multipart/form-data`**). The server unzips, requires a
`SKILL.md` at the root, parses its frontmatter into `manifest` + body into `skill_md`/`prompt_body`,
records the packaged files in `resources`, and persists a library Skill (`source = "upload"`).
- **Request** (`multipart/form-data`):
  - `file`: the `.zip` (required)
  - `is_public`: bool form field (default `false`)
  - `agent_id`: uuid form field (optional — attach to an agent)
- **201** → `Skill` (carries `skill_md` / `manifest` / `resources` for preview)
- **422** no `SKILL.md` in the archive / invalid pack

#### `GET /api/skills` 🔓
- **Query:** `q`, `tags` (CSV, AND), `owner` (`me`|uuid), `agent_id`, `is_public`, `limit`, `offset`.
- **200** → `{ items: Skill[], total, limit, offset }`

#### `GET /api/skills/{id}` 🔓
- **200** → `Skill` · **404**

#### `PATCH /api/skills/{id}` 🔑 (owner)
- **Request** (all optional): `name`, `description`, `prompt_body`, `params`, `tags`, `executable`, `is_public`.
- **200** → `Skill` · **403** · **404**

#### `DELETE /api/skills/{id}` 🔑 (owner)
- **204** · **403** · **404**

### 3.11 Trips (§6) — 🟢 implemented

#### `POST /api/trips` 🔑
Create a trip from a Task + prompt; the autonomous planner picks scenes + matches opponents, then the
journey runs in the background.
- **Request** → `TripCreate`
```json
{ "agent_id": "uuid", "task_prompt": "string", "max_encounters": "int?", "duration_seconds": "int?", "scenario_hints": ["string"] }
```
- **201** → `Trip` · **403** agent not owned · **404**

#### `GET /api/trips` 🔑
Caller's trips.
- **Query:** `status`, `agent_id`, `limit`, `offset`.
- **200** → `{ items: Trip[], total, limit, offset }`

#### `GET /api/trips/{id}` 🔑
- **200** → `Trip` (with `encounters`) · **404**

#### `GET /api/trips/{id}/encounters` 🔑
- **200** → `TripEncounter[]` (ascending `seq`) · **404**

#### `POST /api/trips/{id}/cancel` 🔑
- **200** → `Trip` · **404**

#### `GET /api/trips/{id}/stream` 🔓 (SSE)
Live journey channel for the world map (read-only). Events in §4.2. Per-encounter dialogue is spectated
via the existing conversation stream (`GET /api/conversations/{id}/stream`).

### 3.12 Inbox / Notifications (§7) — 🟢 implemented

#### `GET /api/inbox` 🔑
- **Query:** `unread` (bool), `limit`, `offset`.
- **200** → `{ items: Notification[], total, limit, offset }`

#### `GET /api/inbox/unread_count` 🔑
Drives the unread red-dot.
- **200** → `{ "count": 0 }`

#### `POST /api/inbox/{id}/read` 🔑
- **200** → `Notification` · **404**

#### `POST /api/inbox/read_all` 🔑
- **200** → `{ "updated": 0 }`

### 3.13 Relationships (§8) — 🟢 implemented

#### `GET /api/relationships` 🔑
Caller's relationship edges.
- **Query:** `agent_id` (edges touching it), `type`, `limit`, `offset`.
- **200** → `{ items: Relationship[], total, limit, offset }`

#### `GET /api/relationships/graph` 🔑
- **Query:** `agent_id` (optional focus).
- **200** → `RelationshipGraph`

### 3.14 Sandbox (§10) — 🟢 implemented

Authed browser-facing pass-through to the internal **sandbox-runner** (§5), which
is never exposed directly. Powers the standalone **沙盒工作台** workspace. The
request/response mirror the runner's `/run` shape.

#### `POST /api/sandbox/run` 🔑
Forward code to the sandbox-runner and return its result. The requested
`timeout_seconds` is clamped to the server's `SANDBOX_TIMEOUT_SECONDS` hard cap.
- **Request** → `SandboxRunRequest`
```json
{ "code": "print(2+2)", "language": "python", "timeout_seconds": 10, "stdin": "" }
```
- **200** → `SandboxRunResult`
```json
{ "stdout": "4\n", "stderr": "", "exit_code": 0, "duration_ms": 31, "timed_out": false, "language": "python" }
```
- **401** missing/invalid token · **422** empty `code`
- On a sandbox transport failure the endpoint degrades gracefully: it still
  returns **200** with a non-zero `exit_code` and an explanatory `stderr` (it
  never proxies a 5xx), so the workspace can render an evidence card either way.

> `SandboxRunRequest` / `SandboxRunResult` mirror the runner's `/run` body and
> 200 shape (§5). The endpoint adds **auth** + timeout clamping on top.

### 3.15 MCP servers (refactor-2 §5) — 🟡 STUB (ported from Xyzen)

Register MCP tool servers the **sandbox** connects to during encounters. Bodies are filled by Phase 2
(connection/runtime: status probing + tool discovery). Secrets (`token` / secret `config` keys) are
write-only and never serialized.

#### `POST /api/mcps` 🔑 🟡
- **Request** → `McpServerCreate`
```json
{ "name": "string", "description": "string?", "category": "string?", "transport": "stdio | sse | http", "command": "string?", "url": "string?", "token": "string?", "config": {}, "agent_id": "uuid?", "is_public": false }
```
- **201** → `McpServer` · **404** `agent_id` not found · **403** agent not owned

#### `GET /api/mcps` 🔑 🟡
List MCP servers visible to the caller (owned + public).
- **Query:** `owner` (`me`|uuid), `agent_id`, `category`, `q`, `is_public`, `limit`, `offset`.
- **200** → `{ items: McpServer[], total, limit, offset }`

#### `GET /api/mcps/{id}` 🔑 🟡
- **200** → `McpServer` · **403** · **404**

#### `PATCH /api/mcps/{id}` 🔑 🟡 (owner)
- **Request** (all optional): `name`, `description`, `category`, `transport`, `command`, `url`, `token`, `config`, `agent_id`, `is_public`.
- **200** → `McpServer` · **403** · **404**

#### `DELETE /api/mcps/{id}` 🔑 🟡 (owner)
- **204** · **403** · **404**

#### `POST /api/mcps/{id}/connect` 🔑 🟡 (owner)
Probe/connect the server inside the sandbox and discover its tools (updates `status` / `tools`).
- **200** → `McpConnectResponse` · **403** · **404**

---

## 4. SSE Event Payloads (LOCKED)

The stream emits named events. `data:` is JSON. `id:` is the integer message `seq` where applicable.

```
event: message-start
id: 12
data: {"conversation_id":"uuid","message_id":"uuid","seq":12,"turn_index":3,"agent_id":"uuid","sender":"agent"}

event: message-delta
id: 12
data: {"conversation_id":"uuid","message_id":"uuid","seq":12,"delta":"partial text chunk"}

event: message-end
id: 12
data: {"conversation_id":"uuid","message_id":"uuid","seq":12,"turn_index":3,"agent_id":"uuid","sender":"agent","content":"full final text","meta":{}}

event: sandbox-output
id: 13
data: {"conversation_id":"uuid","message_id":"uuid","sandbox_run_id":"uuid","agent_id":"uuid","language":"python","stdout":"...","stderr":"...","exit_code":0,"duration_ms":142}

event: conversation-end
data: {"conversation_id":"uuid","status":"completed","n_rounds":5,"report_id":"uuid"}

event: ping
data: {"t":"2026-06-06T12:00:00Z"}
```

Client rules:
- A logical message = one `message-start`, zero or more `message-delta` (append `delta` in order), one
  `message-end` (authoritative final `content`).
- `sandbox-output` is rendered as a distinct "evidence" bubble.
- On `conversation-end`, close the stream and optionally fetch the report via `report_id`.
- Ignore unknown event names and `ping`.

### 4.2 Trip journey stream — `GET /api/trips/{id}/stream` 🟢 (§3.11)

The world map renders the travelling-frog journey from these events. `data:` is JSON.

```
event: trip-status
data: {"trip_id":"uuid","status":"traveling"}

event: agent-status
data: {"trip_id":"uuid","agent_id":"uuid","agent_status":"traveling"}

event: encounter-start
data: {"trip_id":"uuid","encounter_id":"uuid","seq":0,"scenario_id":"uuid","scenario_key":"cafe","opponent_agent_id":"uuid","conversation_id":"uuid"}

event: encounter-end
data: {"trip_id":"uuid","encounter_id":"uuid","seq":0,"status":"completed","report_id":"uuid","postcard":{}}

event: trip-end
data: {"trip_id":"uuid","status":"completed","summary_report_id":"uuid"}

event: ping
data: {"t":"2026-06-07T12:00:00Z"}
```

Client rules:
- `agent_status` drives the avatar's animation state (thinking → departing → traveling → meeting →
  talking → returning → home).
- On `encounter-start`, open the conversation stream (`conversation_id`) to spectate that leg live.
- On `trip-end`, close the stream and optionally fetch the summary report (`summary_report_id`).
- Ignore unknown event names and `ping`.

### 4.3 Plaza presence stream — `GET /api/scenarios/{id}/stream` 🟡 (refactor-2 §3/§6)

The 2.5D plaza renders other users' 小人 entering / leaving / walking from these events. `data:` is JSON.

```
event: presence-snapshot
data: {"scenario_id":"uuid","count":2,"entries":[{"...PresenceEntry":"..."}]}

event: presence-enter
data: {"scenario_id":"uuid","entry":{"...PresenceEntry":"..."}}

event: presence-move
data: {"scenario_id":"uuid","agent_id":"uuid","x":12.0,"y":34.0,"status":"walking"}

event: presence-leave
data: {"scenario_id":"uuid","agent_id":"uuid"}

event: encounter-started
data: {"scenario_id":"uuid","conversation_id":"uuid","agent_ids":["uuid","uuid"]}

event: ping
data: {"t":"2026-06-07T12:00:00Z"}
```

Client rules:
- On connect, the server may emit one `presence-snapshot` to seed current occupants; thereafter apply
  `presence-enter` / `presence-move` / `presence-leave` deltas.
- `encounter-started` marks an in-plaza meeting; open the conversation stream (`conversation_id`) to
  spectate it.
- Ignore unknown event names and `ping`.

---

## 5. Internal Service — sandbox-runner (LOCKED)

A standalone container with **no DB, no secrets, no external network**. The backend calls it at
`SANDBOX_URL` (compose default `http://sandbox-runner:8001`). It is **not** exposed under `/api`.

#### `POST /run`
- **Request**
```json
{ "code": "print(2+2)", "language": "python", "timeout_seconds": 10, "stdin": "" }
```
- **200**
```json
{ "stdout": "4\n", "stderr": "", "exit_code": 0, "duration_ms": 31, "timed_out": false, "language": "python" }
```
- **400** unsupported language · **200 with `timed_out: true`** when the hard timeout is hit.

#### `GET /health`
- **200** → `{ "status": "ok", "service": "sandbox-runner" }`

---

## 6. Status Matrix

| Group | State | Owner |
| --- | --- | --- |
| `GET /health` | 🟢 implemented | foundation |
| Auth (`register`/`login`/`me`) | 🟢 implemented | foundation |
| Agents (create/list/get/fork/patch) | 🟢 implemented (+ `prompt_config` brain) | Phase 1 |
| `POST /api/agents/generate` | 🟢 implemented | create-tune (§3) |
| Skills — standalone v2 (`/api/skills`) | 🟢 implemented | skills-market (§4) |
| Scenarios | 🟢 implemented | foundation |
| Dispatches (legacy 1:1) | 🟢 implemented | foundation |
| Trips (autonomous journeys + SSE) | 🟢 implemented | orchestrator (§6) |
| Conversations + SSE | 🟢 implemented | foundation |
| Reports | 🟢 implemented | foundation |
| Evolutions | 🟢 implemented | foundation |
| Marketplace (list/create/fork/points) | 🟢 implemented | foundation |
| Marketplace v2 (like/versions/publish) | 🟢 implemented | skills-market (§4) |
| Inbox / notifications | 🟢 implemented | reports-inbox (§7) |
| Relationships / graph | 🟢 implemented | relationship-graph (§8) |
| sandbox-runner `/run` + `/health` | 🟢 implemented | foundation |
| `POST /api/sandbox/run` (authed pass-through) | 🟢 implemented | integrate (§10) |
| `POST /api/scenarios` (user-created) | 🟡 STUB | scenarios-open (r2 §2) |
| Scenario presence (`enter`/`leave`/`presence`/`stream`) | 🟡 STUB | presence-multiplayer (r2 §3/§6) |
| `POST /api/skills/import` (.zip → SKILL.md) | 🟡 STUB | skills-market (r2 §5) |
| MCP servers (`/api/mcps` CRUD + `connect`) | 🟡 STUB | skills-market / sandbox (r2 §5) |

> **Migration head:** `06e68300418b` (refactor-2 foundation: `scenarios.owner_id`/`is_public`,
> `skills.skill_md`/`manifest`/`resources`, new `mcp_servers` table). Chain:
> `610db5a44c38 → 92740f62549b → 4aa2aa57b4ea → 06e68300418b`. New workstreams add their models +
> migrations **on top of this head**, keeping a single linear chain.
>
> Later workstreams must keep paths, methods, auth, and JSON shapes **identical** to this document, and
> fill the STUB bodies (replacing the `501`). Where v2 added optional fields to v1 objects, persist them
> when migrating the model; until then they serialize as their documented defaults.
