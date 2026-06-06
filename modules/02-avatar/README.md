# Module 02: Agent Virtual Avatar Generation

Owner: Le_Poete (sjx branch)

## Scope

- Design the questionnaire (基础信息 + 折叠精准化问卷).
- Generate a structured virtual identity card from answers (Persona / Skills / Rules / image prompt).
- Keep generated avatars available for the rest of the platform.

## Current V0 Decision

The page is a structured questionnaire plus a local preview. It does **not** call an
image model yet. The generated result is a profile card composed of four prompt
segments, deterministically assembled on the server (no LLM calls).

### Profile fields

Each entry in `data/module-avatar-profiles.json` looks like:

| Field            | Source           | Notes                                                 |
|------------------|------------------|-------------------------------------------------------|
| `agentName`      | form, required   | Name of the digital twin                              |
| `role`           | form, required   | Short role / category                                 |
| `personality`    | form, required   | Free-text personality description                     |
| `visualStyle`    | form, required   | Visual / illustrative direction                       |
| `color`          | form, select     | Color direction (4 presets)                           |
| `expertise`      | form, optional   | Area of expertise (新增字段)                          |
| `hobbies`        | form, optional   | Array (textarea split by `\n` or `,`)                 |
| `questionnaire`  | form, optional   | Map of answers from the precision questionnaire       |
| `persona`        | server, derived  | `Persona: <name> is a <role>. Personality: ...`       |
| `skills`         | server, derived  | `Skills: expertise in ... Hobbies / interests: ...`   |
| `rules`          | server, derived  | Default character / safety guidance                   |
| `imagePrompt`    | server, derived  | `Visual brief — ... Color direction: ... Subject: ...` |
| `prompt`         | server, derived  | `persona + skills + rules + imagePrompt` joined by `\n\n` (向后兼容旧字段) |
| `id`, `created_at` | server         | UUID + ISO timestamp                                  |

The card UI shows the color swatch, role, personality tagline, three text
segments (Persona / Skills / Rules), an expandable `<details>` with the full
image prompt, and a "Copy prompt" button that copies `imagePrompt` to clipboard.

### Backward compatibility

Old entries that lack the new fields render gracefully — `escapeHtml(undefined)`
yields an empty string and the corresponding paragraphs simply show empty bodies
without throwing.

## Files

- Page: `modules/web/avatar.html`
- Script: `modules/web/avatar.js`
- Shared styles: `modules/web/module.css` (`.questionnaire`, `.swatch`, `details > summary`)
- API: `POST /api/module-avatar/profiles` and `GET /api/module-avatar/profiles`
- Server logic: `scripts/serve-local-mirror.mjs` → `makeAvatarProfile()`
- Data store: `data/module-avatar-profiles.json` (capped at 200 entries)

## Later

- Wire `imagePrompt` to a real VLM / image generator via `.env`-driven provider.
- Persist generated image URLs or local image paths back into the profile.
- Link an avatar profile back to an uploaded agent ID for cross-module reuse.
- Replace the deterministic prompt segments with LLM-authored Persona/Skills/Rules.
