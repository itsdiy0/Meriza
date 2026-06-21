# CLAUDE.md

Project rules for Meriza. Read this at the start of every session and follow it over any default habits.

## What this project is

Meriza is a presence-first conversational AI interface. The signature is a living point-cloud orb that reflects the model's state (idle, listening, thinking, responding). The full feature spec lives in the build prompt. This file is the standing rulebook: how to write the code and how to behave in a session. When the prompt and this file agree, follow both. When in doubt about scope, prefer the smaller thing.

## Stack

- Next.js (App Router) and TypeScript.
- Tailwind CSS, dark theme, minimal chrome.
- Three.js for the orb (WebGL point cloud, custom GLSL).
- Anthropic API as the default provider, called server side with streaming, behind a thin provider interface.
- Docker for self-hosting. One container in Phase 1.

## Code style

- Write commit-ready code. No `// TODO`, no `// CHANGED`, no `// NEW`, no narration comments, no commented-out code. Comment only where the intent is genuinely non-obvious, and explain why, not what.
- No em dashes anywhere, including code comments and docs. Use commas, colons, parentheses, or separate sentences.
- Strong typing throughout. No `any` in application code. Prefer precise types and discriminated unions over loose objects.
- Idiomatic TypeScript and idiomatic React. Reach for the standard library and platform APIs before hand-rolling equivalents or pulling in a dependency.
- No premature abstraction. Do not add layers, generics, config systems, or interfaces for cases that do not exist yet. Two concrete copies beat one wrong abstraction.
- Small, readable files. If a file is doing two jobs, split it along the lines already laid out in the file layout.
- Consistent formatting. Prettier and ESLint clean.

## Architecture rules

- Keep the file layout from the build prompt. Do not invent new top-level folders without a reason.
- The Anthropic key never reaches the client. All model calls happen in route handlers.
- Keep the provider behind `lib/llm/provider.ts` (a single `stream(messages)` method). The UI talks to the provider interface, never to Anthropic directly.
- Streaming is the default response path. The client updates the last assistant message as chunks arrive.
- Orb GLSL lives in `lib/orb/shaders.ts` and state presets in `lib/orb/states.ts` so `Orb.tsx` stays readable.

## Orb rules

- The orb is the hero at every screen size. Never shrink it to a corner badge.
- `<Orb state amplitude? onTap? />`. React only feeds props; the component owns its Three.js scene.
- State changes ease, they never snap. Retarget uniforms and lerp toward them per frame.
- Respect `prefers-reduced-motion` (cut rotation, reduce breath and wobble).
- Performance scaling is required: cap devicePixelRatio at 2, use a lower point count on mobile (around 2,200 vs around 4,200 on desktop), and pause the render loop when the tab is hidden.
- `touch-action: none` on the canvas so dragging the orb does not scroll the page, while the transcript still scrolls.

## Scope guardrails (Phase 1 only)

Do not build any of these unless explicitly asked:

- No auth, accounts, or multi-user.
- No database or server-side persistence (conversation is in memory for the session).
- No separate backend service. Route handlers are the backend.
- No microphone, speech to text, or text to speech yet (Phase 2).
- No analytics or telemetry.

If a task seems to need one of these, stop and flag it rather than building it.

## Session workflow

- Plan before scaffolding. For any non-trivial task, propose the plan and the files you will touch, then wait for go-ahead before writing.
- Make small, focused commits with clear messages. One logical change per commit. Do not bundle unrelated edits.
- Before calling a task done, run type-check and lint and make sure they pass. Do not report success on code that does not type-check.
- Verify responsiveness at 375px, 768px, and 1280px, and in both mobile orientations, before considering UI work complete.
- If you are unsure between two approaches, ask. Do not silently pick the heavier one.

## Commands

Keep these scripts working and use them:

- `npm run dev` for local development.
- `npm run build` and `npm start` for the production build.
- `npm run typecheck` for the TypeScript check.
- `npm run lint` for ESLint.
- `docker compose up` to run the self-hosted app from env.

## Environment

- `ANTHROPIC_API_KEY` for the provider.
- `MERIZA_MODEL` selects the chat model (default to a current Claude Sonnet model). Keep it a single env value.
- `MERIZA_SYSTEM_PROMPT` (optional) sets Meriza's voice: calm and concise.

Keep `.env.example` in sync with anything you add here.
