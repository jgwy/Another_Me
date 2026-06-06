# Another Me — Frontend

The web client for **Another Me**: build an AI twin, dispatch it into living
scenarios, and spectate the conversation live.

Stack: **Vite + React 19 + TypeScript + Tailwind v4**, with React Router 7,
TanStack Query, Zustand, and Motion.

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

## Project layout

```
src/
  lib/        api.ts (typed fetch client) · sse.ts (EventSource stream) · queryClient.ts
  store/      auth.ts (Zustand auth store, persisted to localStorage)
  styles/     index.css (Tailwind v4 @theme design tokens + base styles)
  components/ layout/ (AppShell, NavBar) · ui/ (Button, Input, Card)
  features/   auth/ (Login, Register) · home/ (HomePage)
  routes/     router.tsx (createBrowserRouter config + protected routes)
```

The API/SSE types and endpoints in `src/lib/` mirror `docs/api-contract.md`
(v1, LOCKED) exactly — snake_case fields, `/api` paths, `/health` at root.

## Tailwind

Tailwind v4 is wired through the official `@tailwindcss/vite` plugin — there is
**no** `tailwind.config.js` or PostCSS config. Design tokens live in an
`@theme { … }` block in `src/styles/index.css`.

## Docker

```bash
docker build -t another-me-frontend .
docker run -p 5173:5173 another-me-frontend
```

(Normally started via the project's `docker compose`.)
