# CLAUDE.md

Project rules for Meriza. Read this at the start of every session and follow it
over any default habits.

This file is the standing rulebook: how to write the code and how to behave in
a session. `docs/decisions.md` is the companion: standing calls and the
reasoning behind them, including several that reverse what an earlier document
said. When the two disagree, `decisions.md` is newer. When in doubt about
scope, prefer the smaller thing.

## What this project is

Meriza is a presence-first conversational AI interface. The signature is a
living point-cloud orb that reflects the model's state and speaks its replies
aloud, with the orb's motion driven by the audio actually playing. Everything
else in the interface stays quiet so the orb carries the personality.

Phases are tracked as GitHub milestones. Phase 1 (presence) and Phase 2 (voice
out) are done. Phase 3 is the interface around the orb.

## Stack

- Next.js (App Router) and TypeScript.
- Tailwind CSS, dark theme, minimal chrome.
- Three.js for the orb (WebGL point cloud, custom GLSL).
- Anthropic API as the default LLM provider, called server side with
  streaming, behind a thin provider interface.
- An OpenAI-compatible TTS engine, running as a separate service outside this
  repo, reached by base URL.
- Web Audio for playback, scheduling, and the analyser that drives the orb.
- Docker for self-hosting.

## Code style

- Write commit-ready code. No `// TODO`, no `// CHANGED`, no `// NEW`, no
  narration comments, no commented-out code. Comment only where the intent is
  genuinely non-obvious, and explain why, not what.
- No em dashes anywhere, including code comments and docs. Use commas, colons,
  parentheses, or separate sentences.
- Strong typing throughout. No `any` in application code. Prefer precise types
  and discriminated unions over loose objects.
- Idiomatic TypeScript and idiomatic React. Reach for the standard library and
  platform APIs before hand-rolling equivalents or pulling in a dependency.
- No premature abstraction. Do not add layers, generics, config systems, or
  interfaces for cases that do not exist yet. Two concrete copies beat one
  wrong abstraction. This rule has already earned its place twice: an
  `AmplitudeSource` interface and a positional-argument TTS constructor were
  both built and then removed for having no second consumer.
- Small, readable files. If a file is doing two jobs, split it.
- Consistent formatting. Prettier and ESLint clean.

## File layout

```
app/
  page.tsx                 the interface: orb, transcript, composer
  lab/page.tsx             dev harness for the motion score
  api/chat/route.ts        streaming LLM endpoint
  api/tts/route.ts         synthesis endpoint
components/                Orb, Composer, Transcript, RevealedText
lib/
  llm/                     provider interface, Anthropic client, system prompt
  tts/                     provider interface, OpenAI-compatible client
  audio/                   speech player, chunker, markdown stripper
  transcript/              reveal pacing
  orb/                     shaders, state presets
  orb/motion/              motion sources and the mixer
docs/                      decisions.md and specs
```

Do not invent new top-level folders without a reason.

## Architecture rules

- No secret reaches the client. The Anthropic key and the TTS base URL both
  stay server side, in route handlers.
- Both LLM and TTS sit behind provider interfaces. The UI talks to the
  interface, never to Anthropic or to the engine directly. Exactly one line
  names a concrete implementation, inside its factory.
- The TTS engine is external infrastructure, never vendored. No weights, no
  Python runtime, no compose service for it in this repo.
- Streaming is the default response path for the LLM.
- Orb GLSL lives in `lib/orb/shaders.ts` and state presets in
  `lib/orb/states.ts` so `Orb.tsx` stays readable.
- Meriza's system prompt lives in `lib/llm/prompt.ts` and is imported by every
  provider. It is a product decision, not an Anthropic detail.

## Orb rules

- The orb is the hero at every screen size. Never shrink it to a corner badge.
- `<Orb state onFrame? onTap? />`. React only feeds props; the component owns
  its Three.js scene and its render loop.
- State changes ease, they never snap. Retarget uniforms and lerp toward them
  per frame.
- Respect `prefers-reduced-motion` (cut rotation, reduce breath and wobble).
- Performance scaling is required: cap devicePixelRatio at 2, use a lower point
  count on mobile (around 2,200 versus around 4,200 on desktop), and pause the
  render loop when the tab is hidden.
- `touch-action: none` on the canvas so dragging the orb does not scroll the
  page, while the transcript still scrolls.

## Motion contract

- Every motion source implements `MotionSource` and emits a `MotionFrame` per
  rendered frame: amplitude and wobble on an identical 0..1 scale (0 resting,
  1 peak), plus a ripple edge.
- Smoothing and the frame loop live in the consumer, never in a source. A
  source owns no timers and no `requestAnimationFrame`.
- `frame` is called at most once per source per rendered frame. `ripple` is
  edge state and a second read in the same frame consumes it.
- The active source can change mid-utterance, so `MotionMixer` owns the
  handover and crossfades. Amplitude and wobble blend; ripple does not, and
  comes from the incoming source only.
- The sources are `waiting`, `score`, and `analyser`. Idle is not a source: it
  is the absence of one, and the orb falls back to its state preset.
- New sources must drop in without changing `Orb.tsx`.

Read the score-versus-filler entry in `decisions.md` before touching this. An
earlier design had the score covering the synthesis gap, and that was wrong for
reasons that are not obvious from the code.

## Speech rules

- Text reaches the engine only through `speakable`. It never receives raw
  model output.
- The transcript keeps its markup and its emoji. The speech path loses both.
- Chunk sizes are bounded on both sides and capped at the engine's internal
  chunk size. See `decisions.md` for the measurements behind the numbers.
- Clips are scheduled on the AudioContext clock, never started on arrival.
- The player is the clock for anything that follows the speech. The transcript
  is paced by its chunk events, not by the LLM stream.

## Scope guardrails

Do not build any of these unless the current milestone says so:

- No auth, accounts, or multi-user. Not planned.
- No analytics or telemetry. Not planned.
- No database or server-side persistence. Phase 5.
- No microphone or speech to text. Phase 4.
- No separate backend service. Route handlers are the backend.

If a task seems to need one of these, stop and flag it rather than building it.

## Session workflow

- Work is issue-based. Every change belongs to an open issue on the board, and
  the issue is closed with a comment describing what actually shipped, not just
  that it did. Work frequently exceeds its written scope, and a bare "done"
  hides the decisions that came with it.
- From Phase 3, work happens on a branch per issue.
- Plan before scaffolding. For any non-trivial task, propose the plan and the
  files you will touch, then wait for go-ahead before writing.
- Small, focused commits with clear messages in `type(scope): action` form. One
  logical change per commit.
- Before calling a task done, run type-check and lint and make sure they pass.
  Do not report success on code that does not type-check.
- Verify responsiveness at 375px, 768px, and 1280px, and in both mobile
  orientations, before considering UI work complete.
- When a decision reverses, or a guess becomes a measurement, update
  `decisions.md`. Do not update it for ordinary code changes: it is a slow
  file, and a version that tracks the code will rot into the thing it was
  written to prevent.
- If you are unsure between two approaches, ask. Do not silently pick the
  heavier one.

## Commands

- `npm run dev` for local development.
- `npm run build` and `npm start` for the production build.
- `npm run typecheck` for the TypeScript check.
- `npm run lint` for ESLint.
- `docker compose up` to run the self-hosted app from env.

The TTS engine runs separately and is not covered by these.

## Environment

- `ANTHROPIC_API_KEY` for the LLM provider.
- `MERIZA_MODEL` selects the chat model. Keep it a single env value.
- `MERIZA_SYSTEM_PROMPT` optionally overrides the prompt in
  `lib/llm/prompt.ts`. Useful for quick experiments; the file is the real knob,
  since a multi-line prompt is miserable to edit in `.env`.
- `TTS_BASE_URL` points at the engine, including `/v1`.
- `TTS_MODEL` and `TTS_VOICE` select the model and voice. Voice identifiers are
  engine-specific and never portable.

Keep `.env.example` in sync with anything added here.