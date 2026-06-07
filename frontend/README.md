# 觅见.AI — Frontend

The web client for **觅见.AI**: build an AI **twin** (分身), send it out into a
living social world, and watch it think, travel, meet other twins, talk, and
come back with what it learned.

Stack: **Vite + React 19 + TypeScript + Tailwind v4**, with React Router 7,
TanStack Query, Zustand, Motion, and **i18next** (react-i18next) for a
Chinese-first, bilingual UI.

## Prerequisites

- Node.js **24 LTS** (or newer)
- npm

## Getting started

```bash
cd frontend
npm install          # install dependencies (creates package-lock.json)
npm run dev          # start the dev server at http://localhost:5173
```

Configure the backend URL by copying `.env.example` to `.env`:

```bash
cp .env.example .env
# VITE_API_BASE_URL=http://localhost:8000  (default fallback)
```

## Scripts

| Script            | Description                                          |
| ----------------- | ---------------------------------------------------- |
| `npm run dev`     | Vite dev server (host enabled) on port `5173`.       |
| `npm run build`   | Type-check (`tsc -b`) then build for production.     |
| `npm run preview` | Preview the production build on port `4173`.         |

## Internationalization (i18n)

The UI is **Chinese-first** (zh is the default & fallback) with **English**
coexisting and switchable from the nav (`LanguageSwitcher`).

- Setup: `src/i18n/index.ts` (i18next + `i18next-browser-languagedetector` +
  `react-i18next`). Language detection reads an explicit choice from
  `localStorage` (`mijian.lang`) then the `<html lang>` tag (ships as `zh`), so
  a first visit lands on Chinese and a switch is remembered.
- Locale packs are **namespaced**, one JSON per namespace per language under
  `src/i18n/locales/{zh,en}/<ns>.json`:
  `common · nav · agents · create · marketplace · island · reports ·
  conversation · sandbox · inbox · relationships · trips`. zh↔en keys are kept
  **1:1** (ASCII dot-paths).
- Usage:

```tsx
import { useTranslation } from "react-i18next";

const { t } = useTranslation("agents");          // one namespace
t("list.title");
// cross-namespace:
const { t } = useTranslation(["island", "common"]);
t("common:actions.save");
```

- Keys are ASCII dot-paths; values are translated. **Domain content**
  (personas, scene prompts, report bodies, message text from the backend) is
  intentionally NOT translated here — only the UI chrome.

## Design system

A unified token layer lives in an `@theme { … }` block in `src/styles/index.css`
and is consumed app-wide (no `tailwind.config.js`, no PostCSS). The theme is
**自然治愈 (warm-natural), light**: a paper-cream canvas, **moss-green `brand`**
as the single hero accent, **warm-terracotta `accent`** touches, soft warm-tinted
shadows and paper rounding. Typography pairs **Fraunces** (rounded organic
display, applied to headings via `--font-display`) with **Nunito Sans** (warm
humanist body, `--font-sans`); JetBrains Mono for code. Token **names are stable**
across themes — only their values changed when retheming away from the previous
dark/violet palette, so every consumer keeps working.

- **Surfaces/text/brand**: `canvas / surface / surface-2 / elevated`, `ink /
  muted / faint`, moss-green `brand` + terracotta `accent`.
- **Scenario accents** (shared by the world map + cards): `--color-scn-*`
  (exchange/cafe/lab/coding).
- **Journey palette** (travel-frog `agent_status`): `--color-journey-*`
  (thinking → departing → traveling → meeting → talking → returning → home).
- **World canvas**: `--color-world-*` + the `.world-canvas` / `.world-vignette`
  helpers for the immersive map backdrop.
- **Motion language**: easings/durations + shared Motion presets in
  `src/lib/anim.ts` (`spring.*`, `travel/wander/bob/breathe/ripple`, `popIn`,
  `statusSwap`). Everything animates transform/opacity only → 60fps.

## The living world (island)

`features/island/` is a full-screen, immersive **living world**, now a light
**2.5D isometric** map (a CSS/SVG dimetric projection in `iso.ts` — no game
engine, no sprite sheets). Buildings render from the **dynamic scenario list**
(`scenario.meta` coords + category, not a hardcoded 4); ambient resident **小人**
wander the meadow, and the user's twin is a little walking character that thinks,
departs, crosses the world, meets, talks, and returns — animated with Motion
(transform/opacity only, 60fps). **Clicking a building enters its plaza**
(`/plaza/:scenarioId`); clicking the twin (or a journey-panel row) focuses an
**encounter** to spectate / read its report. Buildings are status surfaces, not
"dispatch here" buttons.

It renders against the typed data seam in `src/lib/trips.ts` — the contract
`Trip` / `TripEncounter` / `TripPlan` shapes (`agent_status`, `status`,
per-encounter `opponent` / `match_reasons` / `match_risks` / `postcard`), the
`useTrips` / `useActiveTrip` queries, and the **unified live driver**
`useTripJourney`. For a **real** trip, `useTripJourney` subscribes to the
journey SSE stream (`GET /api/trips/{id}/stream`, see `openTripStream` in
`src/lib/sse.ts`) and feeds the live `agent_status` + active encounter straight
into the `IsoTraveler` layer; encounter/trip ends refetch the trip so
reports + postcards land. For a **mock/demo** trip it runs a client-side
simulator instead, so the world is alive without a backend. Either way it emits
a smooth 0..1 `progress` for 60fps path tweening, and freezes on the trip's real
phase under reduced motion. At integration only the mock fallback comes out.

## The plaza

`features/plaza/` (route `/plaza/:scenarioId`, reached by clicking a building) is
the same world up close: the **other users' twins** present in that scene drift
around an isometric plaza as little characters (小人) you can **click** (→ focus
the twin), and **encounters underway are spectatable**. It consumes **presence**:
a snapshot poll (`GET /api/scenarios/{id}/presence`) plus an SSE channel
(`GET /api/scenarios/{id}/stream`) speaking the **locked contract** events
`presence-snapshot` / `presence-enter` / `presence-move` / `presence-leave` /
`encounter-started` (+ `ping`), wired in `features/plaza/presence.ts` — which
normalizes the wire `PresenceEntry` rows into the UI's `PresenceTwin` — with the
same **real-first, typed-mock fallback** pattern as `trips.ts` (a gentle simulator
keeps the mock plaza lively). The caller's own travelling twin is overlaid when
its journey has it in that scene. Plaza copy lives in a runtime `plaza` i18n
bundle (zh↔en) registered from the feature, so it never touches the shared
`src/i18n` files.

## Feature surfaces

Every page calls the **real endpoint first** and falls back to a typed mock
(flipping a "演示数据 / demo" pill via `useDemoMode`) so the whole app is
demonstrable before the backend is wired. Hooks live in `src/lib/queries.ts`
(+ `src/lib/trips.ts` for journeys).

| Route | Feature | Real endpoints (mock fallback) |
| --- | --- | --- |
| `/` | **2.5D living world** (island) — N buildings from the dynamic scenario list; "新建场景" affordance | `GET /api/scenarios`, `GET /api/trips` + journey SSE `/api/trips/{id}/stream` |
| `/plaza/:scenarioId` | **Plaza** — present twins (小人) drift + are clickable; spectate encounters | `GET /api/scenarios/{id}/presence` + presence SSE `/api/scenarios/{id}/stream` |
| `/scenarios/new` | **Create a scenario** — author your own stage (kind/topics/scene prompt) | `POST /api/scenarios` |
| `/agents/new` | **捏脸 three entries** — questionnaire · NL guided · paste-corpus | `POST /api/agents/generate`, `POST /api/agents` (sends `prompt_config` + `skill_ids`) |
| `/agents/:id` | Twin profile + **dual-mode tune** (guided form ↔ raw `prompt_config` JSON) + dispatch rail | `PATCH /api/agents/{id}` |
| `/dispatch` | **Autonomous dispatch** — only Task + prompts; reveals the explainable plan (reasons/risks) | `POST /api/trips` |
| `/trips/:id` | **Trip detail** — plan, encounters, postcards, summary, cancel | `GET /api/trips/{id}`, `POST /api/trips/{id}/cancel` |
| `/marketplace` | **Marketplace v2** — browse/like/fork + versions + publish + `fork_mode` | `GET/POST /api/marketplace`, `{id}/like`, `{id}/versions`, `{id}/publish` |
| `/sandbox` | **Sandbox workspace** — run scripts, output as an evidence bubble | `POST /api/sandbox/run` (pass-through; mock until it lands) |
| `/inbox` | **Mailbox** — postcards · per-encounter reports · trip summaries, mark read/all (nav red-dot) | `GET /api/inbox`, `/unread_count`, `{id}/read`, `/read_all` |
| `/relationships` | **Relationship graph** — the densifying social network (radial SVG) | `GET /api/relationships/graph` |
| `/reports/:id` | **Report by id** — handles the `trip_summary` kind + null `conversation_id` | `GET /api/reports/{id}` |

The skill-selection step in 捏脸 multi-selects from **library skills**
(`GET /api/skills`) and **marketplace skills**, injecting `skill_ids` into the
new twin (own free-text uploads still flow through as `uploaded_skills`).

## Project layout

```
src/
  i18n/       index.ts (i18next init, zh default, 13 namespaces) · locales/{zh,en}/<ns>.json
  lib/        api.ts (typed fetch + all v2 types + PromptConfig helpers)
              trips.ts (contract Trip data + mock + useTripJourney SSE/sim driver)
              queries.ts (React Query hooks + mock fallback) · sse.ts (conversation + trip streams)
              anim.ts · format.ts · mocks.ts/mockData.ts (typed mock backend)
  store/      auth.ts (Zustand auth store, persisted to localStorage)
  styles/     index.css (Tailwind v4 @theme design tokens + base + utilities)
  components/ layout/ (AppShell, NavBar + unread dot, PageHeader, LanguageSwitcher) · ui/
  features/   island/ (2.5D living world + journey) · plaza/ (presence-driven) · agents/ · create-agent/ (3 entries + tune)
              · dispatch/ (autonomous) · trips/ · marketplace/ (v2) · sandbox/
              · inbox/ · relationships/ · reports/ · conversation/ · auth/
  routes/     router.tsx (createBrowserRouter + protected routes)
```

The API/SSE types and endpoints in `src/lib/` mirror `docs/api-contract.md`
(snake_case fields, `/api` paths, `/health` at root).

## Tailwind

Tailwind v4 is wired through the official `@tailwindcss/vite` plugin — there is
**no** `tailwind.config.js` or PostCSS config. Design tokens live in an
`@theme { … }` block in `src/styles/index.css`.

## Docker

```bash
docker build -t mijian-ai-frontend .
docker run -p 5173:5173 mijian-ai-frontend
```

(Normally started via the project's `docker compose`.)
