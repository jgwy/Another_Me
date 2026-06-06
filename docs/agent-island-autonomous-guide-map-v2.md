# Agent Island Autonomous Guide Map v2

## Goal

Module 03 should feel like an AI agent autonomously walking through a social
theme-park guide map. The human gives intent and dispatches an Agent; the AI
decides where to go, who to meet, how to talk, and what report to bring back.

## Product Direction

- The map should look like a theme-park / amusement-park guide map.
- The visual language should be line-led: curved paths, district boundaries,
  dotted routes, relationship lines, and simple landmark buildings.
- Buildings are not primary "enter" buttons. They are map locations and status
  surfaces.
- The primary action is dispatching the Agent. After dispatch, the AI decides
  which building to visit.
- Building clicks, if kept, should inspect location status only, not force a run.
- Each building should have one unified bubble above it:
  - building icon
  - location name
  - current status
  - nearby/running/completed signal
- No "click to enter" copy should appear on buildings.

## AI Autonomy

The API should drive the map behavior. A run should return:

```json
{
  "intent": "寻找潜在合作对象",
  "chosenScene": "coding-club",
  "reason": "当前 Agent 的技能和目标更适合项目协作场景",
  "route": ["home", "central-path", "coding-club"],
  "targetAgent": "Coding Partner Agent",
  "mapEvents": [
    { "type": "thinking", "label": "读取画像" },
    { "type": "choose_scene", "sceneSlug": "coding-club" },
    { "type": "move", "sceneSlug": "coding-club" },
    { "type": "discover", "agentId": "..." },
    { "type": "conversation" },
    { "type": "report", "sceneSlug": "signal-tower" }
  ]
}
```

Frontend should play these events rather than hardcoding the run path.

## Visual Asset Requirement

Use image generation, preferably the user's requested `image2` path/tool when
available, to create a project-bound guide-map base image.

Target asset:

```text
apps/web/public/agent-island-guide-map.png
```

Prompt direction:

```text
Use case: stylized-concept
Asset type: web app map background
Primary request: a soft futuristic theme-park guide map for "Agent Island"
Scene/backdrop: top-down/isometric amusement park map with five social zones
Subject: Cafe, Exchange, Lab, Coding Club, Memory Garden, Signal Tower
Style/medium: polished product-demo illustration, line-led, clean map design
Composition/framing: wide 16:9 map, clear paths between buildings, spacious
  areas for HTML/SVG overlays and bubbles
Color palette: calm varied colors, not one-note purple, beige, or dark slate
Text: no embedded text in the image
Constraints: no labels, no watermark, no UI chrome, no people baked into image
```

The generated image should be decorative/base-layer only. Interactive state
must remain in React/SVG/HTML overlays.

## Agent Character Direction

Agents should not be simple dots. Use small mascot people:

- rounded head and body
- small icon/accessory showing role
- distinct color per Agent
- animated movement along the guide path

Examples:

- Founder Agent: rocket or pitch accessory
- VC Agent: briefcase
- Coding Partner Agent: laptop/code accessory
- Social Explorer Agent: chat bubble
- Lab Specialist Agent: flask
- Long Distance Memory Agent: heart/memory accessory

## Interaction Rules

- Primary CTA: "派出 Agent" / "让 AI 自己去找".
- The human chooses Agent and intent, not destination.
- AI chooses scene and target through the backend planner.
- Buildings display status:
  - idle
  - selected by AI
  - running
  - completed
  - report available
- Signal Tower opens reports/history; it does not run conversation.
- Relationship lines appear only after a completed run.

## Current Implementation Note

The current app has partial support for autonomous planning through
`/autonomous-runs`, including `route` and `mapEvents`. The UI still needs to be
finished so it no longer presents buildings as "click to start" controls.
