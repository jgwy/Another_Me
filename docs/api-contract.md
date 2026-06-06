# Another Me — API Contract (LOCKED v1)

> This document is the **single source of truth** for the REST + SSE surface of Another Me.
> The foundation agent locks it; the **backend-features** agent implements it **exactly**, and the
> **frontend-features** agent consumes it **exactly**. Object shapes here are aligned 1:1 with the
> SQLAlchemy models (`backend/app/models/`) and Pydantic schemas (`backend/app/schemas/`).
>
> Endpoints marked **STUB** return `501 Not Implemented` in the foundation and are filled in by
> later agents. Their request/response shapes are nonetheless final — do not change them.

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

### Skill

```json
{
  "id": "uuid",
  "agent_id": "uuid?",
  "owner_id": "uuid",
  "name": "string",
  "content": "string",
  "source": "questionnaire | upload | evolved",
  "created_at": "datetime"
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
  "profile_tags": ["string"],
  "questionnaire": { "any": "json" },
  "avatar": "string?",
  "max_rounds": 8,
  "is_public": false,
  "forked_from": "uuid?",
  "skills": [ { "...Skill": "..." } ],
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### Scenario

```json
{
  "id": "uuid",
  "key": "exchange | cafe | lab | coding_club",
  "name": "string",
  "description": "string",
  "kind": "business | empathy | generic",
  "topics": ["string"],
  "scene_prompt": "string",
  "ending_prompt": "string",
  "is_full": true,
  "meta": { "building": "string", "x": 0, "y": 0 },
  "created_at": "datetime"
}
```

> `kind` drives report dialect: `exchange → business`, `cafe → empathy`. `lab`/`coding_club` are
> placeholders (`is_full: false`).

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

### MarketplaceItem

```json
{
  "id": "uuid",
  "kind": "agent | skill",
  "ref_id": "uuid",
  "owner_id": "uuid",
  "title": "string",
  "description": "string?",
  "price_points": 0,
  "downloads": 0,
  "created_at": "datetime"
}
```

---

## 3. Endpoints

Legend: 🔓 public · 🔑 requires Bearer JWT · 🟡 **STUB** (501 in foundation) · 🟢 implemented in foundation.

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

### 3.3 Agents — 🟡 STUB (contract final)

#### `POST /api/agents` 🔑
Create from questionnaire, optionally merging uploaded skills. Server synthesizes
`persona` / `rules` / `profile_tags`.
- **Request**
```json
{
  "name": "My Twin",
  "questionnaire": { "domain": "fintech", "personality": ["curious"], "goals": "..." },
  "uploaded_skills": [ { "name": "DCF model", "content": "..." } ],
  "max_rounds": 8,
  "is_public": false,
  "avatar": "string?"
}
```
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
- **Request** (all optional)
```json
{ "name": "...", "persona": "...", "rules": {}, "profile_tags": ["..."], "max_rounds": 6, "is_public": true, "avatar": "..." }
```
- **200** → `Agent` · **403** not owner · **404**

### 3.4 Scenarios — 🟡 STUB (contract final)

#### `GET /api/scenarios` 🔓
- **200** → `Scenario[]`

#### `GET /api/scenarios/{id_or_key}` 🔓
Accepts either the scenario UUID or its `key` (e.g. `exchange`).
- **200** → `Scenario` · **404**

### 3.5 Dispatches — 🟡 STUB (contract final)

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

### 3.6 Conversations — 🟡 STUB (contract final; SSE shape final)

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

### 3.7 Reports — 🟡 STUB (contract final)

#### `GET /api/conversations/{id}/report` 🔓  (canonical)
- **200** → `Report`
- **404** conversation not found · **503** report not generated yet

#### `GET /api/reports/{report_id}` 🔓 (convenience)
- **200** → `Report` · **404**

### 3.8 Evolutions — 🟡 STUB (contract final)

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

### 3.9 Marketplace — 🟡 STUB (contract final)

#### `GET /api/marketplace` 🔓
- **Query:** `kind` (`agent`|`skill`), `q`, `sort` (`downloads`|`recent`), `limit`, `offset`.
- **200** → `{ items: MarketplaceItem[], total, limit, offset }`

#### `POST /api/marketplace` 🔑
List an owned agent or skill on the marketplace.
- **Request**
```json
{ "kind": "agent", "ref_id": "uuid", "title": "Sharp VC Twin", "description": "string?", "price_points": 0 }
```
- **201** → `MarketplaceItem` · **403** not owner of `ref_id` · **404**

#### `POST /api/marketplace/{id}/fork` 🔑
Fork/clone the referenced agent/skill to the caller; increments `downloads`; adjusts points
(simulated economy).
- **201**
```json
{ "item": { "...MarketplaceItem": "..." }, "agent": { "...Agent?": "..." }, "skill": { "...Skill?": "..." } }
```
- **402-like handling:** insufficient points → **400** `{ "detail": "not enough points" }` · **404**

#### `GET /api/marketplace/points` 🔑
Caller's simulated points balance (mirror of `User.points`).
- **200** → `{ "user_id": "uuid", "points": 100 }`

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

## 6. Foundation Status Matrix

| Group | Foundation state |
| --- | --- |
| `GET /health` | 🟢 implemented |
| Auth (`register`/`login`/`me`) | 🟢 implemented |
| Agents | 🟡 STUB (501) |
| Scenarios | 🟡 STUB (501) |
| Dispatches | 🟡 STUB (501) |
| Conversations + SSE | 🟡 STUB (501; SSE route returns a minimal valid stream that emits `ping` + `conversation-end`) |
| Reports | 🟡 STUB (501) |
| Evolutions | 🟡 STUB (501) |
| Marketplace | 🟡 STUB (501) |
| sandbox-runner `/run` + `/health` | 🟢 implemented (basic isolation; hardened later) |

> Later agents must keep paths, methods, auth, and JSON shapes **identical** to this document.
