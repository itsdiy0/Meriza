# Meriza, Build Prompt for Claude Code

> Paste this whole file as the brief for a new project. A working single-file orb prototype (`presence-orb.html`) accompanies this prompt; drop it into the repo and port it into the `<Orb />` component described below. Build Phase 1 end to end and ship it before touching Phase 2.

---

## What you are building

Meriza is a presence-first conversational AI interface. The assistant has a body: a living, breathing orb made of points that sits at the center of the screen. You talk or type, it listens, thinks, and responds, and the orb reflects each of those states through motion and color. The orb is the product's signature and the first thing a user sees. Everything else (input field, transcript, controls) stays quiet so the orb carries the personality.

Target it as a self-hostable web app, dark by default, that feels calm and physical rather than like a chat box with an avatar bolted on.

Audience: someone trying out a self-hosted assistant on desktop or phone. The page's single job is to make a conversation with a model feel like talking to a present, reactive thing.

---

## Tech stack

- **Next.js (App Router) + TypeScript** for the app.
- **Tailwind CSS** for styling. Dark theme, minimal chrome.
- **Three.js** for the orb (WebGL point cloud, custom GLSL shaders).
- **Anthropic API** as the default model provider, called from a server route handler with **streaming** (SSE / ReadableStream). Keep the provider behind a thin interface so a second provider can be added later without touching the UI.
- **Docker** + a `docker-compose.yml` for self-hosting. Single container for Phase 1.

Do not add a database, auth, or a separate backend service in Phase 1. Next.js route handlers are the backend for now. A FastAPI split can come later if it earns its place; do not pre-build for it.

---

## Architecture and file layout

```
meriza/
  app/
    layout.tsx
    page.tsx                 # the single interface: orb + input + transcript
    api/chat/route.ts        # streaming chat endpoint (Anthropic)
  components/
    Orb.tsx                  # the point-cloud orb (ported from prototype)
    Composer.tsx             # text input + send + mic toggle (mic disabled in P1)
    Transcript.tsx           # message list, minimal styling
  lib/
    llm/
      provider.ts            # Provider interface { stream(messages): AsyncIterable<string> }
      anthropic.ts           # Anthropic implementation
    orb/
      shaders.ts             # vertex + fragment GLSL strings
      states.ts              # state presets (idle/listening/thinking/responding)
    types.ts
  Dockerfile
  docker-compose.yml
  .env.example
  README.md
```

Keep it flat and obvious. No premature abstraction layers.

---

## Phase 1, shippable MVP

Scope:

1. One screen. Orb centered, a docked composer (text input + send), and a transcript that builds above or beside the composer.
2. User types a message, it appears in the transcript, the request streams from the Anthropic API, and the assistant's reply renders token by token.
3. The orb is wired to the conversation lifecycle:
   - **idle** when nothing is happening.
   - **thinking** from request send until the first token arrives.
   - **responding** while tokens are streaming in.
   - back to **idle** when the stream ends.
   - **listening** state exists in the component and is reachable, even though mic input lands in Phase 2.
4. Tapping or clicking the orb sends a ripple across its surface from the touch point.
5. Fully responsive (see Responsiveness section). Works with mouse and touch.
6. Conversation lives in memory for the session. No persistence yet.
7. Self-hostable: `docker compose up` serves the app; model and key come from env.

### Acceptance criteria for Phase 1

- Cold start to a streamed reply with a valid key works on first run following the README.
- Orb visibly changes between idle, thinking, and responding during a real exchange, with smooth eased transitions, not hard cuts.
- Tap ripple fires on both desktop click and mobile tap.
- On a phone (375px wide) the orb is the hero, the composer is reachable above the keyboard, and the transcript scrolls without the layout breaking.
- 60fps target on a modern laptop; no jank when streaming text while the orb animates.
- `prefers-reduced-motion` is respected (reduced amplitude and rotation).
- No console errors, no unused exports, type-checks clean.

---

## Later phases (do not build yet)

- **Phase 2:** microphone input via Web Speech API (STT), text to speech for replies, and an audio-reactive orb (drive its energy/amplitude from a live audio analyser so it pulses in time with speech). Persist conversations to local storage.
- **Phase 3:** multiple providers and model picker, a settings panel, conversation history, and optional tool/RAG hooks.

---

## The Orb component

Port the provided prototype into `components/Orb.tsx`. Keep the rendering logic but expose it as a clean, reusable React component. The orb owns a Three.js scene; React only feeds it props.

### Component API

```ts
type OrbState = 'idle' | 'listening' | 'thinking' | 'responding';

interface OrbProps {
  state: OrbState;          // drives motion + palette, eased internally
  amplitude?: number;       // 0..1, optional live energy (used in Phase 2 for audio)
  onTap?: () => void;       // fired on a tap/click that hits the orb surface
}
```

State changes must ease, not snap. The component reads the prop, retargets its internal uniforms, and lerps toward them each frame.

### Behaviors to preserve from the prototype

- Points placed with a Fibonacci distribution for even coverage (no polar clumping).
- A GLSL vertex shader does the work: 3D simplex noise displaces each point radially (the wobble), a global sine term is the breathing, and a travelling sine wave attenuated by angular distance and elapsed time is the tap ripple emanating from the touched point.
- Fragment shader draws each point as a soft round dot with additive blending for glow, and a per-dot flicker that grows with energy.
- A duotone palette that shifts per state, eased between presets:
  - idle: calm teal to indigo, slow breath, low wobble.
  - listening: brighter cyan, slightly expanded, quicker shimmer.
  - thinking: violet, high turbulence, faster rotation.
  - responding: warm amber to rose, fast speech-cadence pulse.
- Raycast a transparent shell (not the points) to detect taps and convert the hit to a surface direction for the ripple.
- Drag to rotate with inertia, plus gentle ambient auto-rotation when not dragging.

Keep the state presets in `lib/orb/states.ts` and the GLSL in `lib/orb/shaders.ts` so the component file stays readable.

---

## Responsiveness requirements (applies to the whole interface, the orb included)

The orb is the hero at every size. It must look intentional on a 375px phone and a wide desktop alike.

- **Layout.** Mobile: orb centered in the upper area, transcript scrolls in the middle, composer docked to the bottom with `env(safe-area-inset-bottom)` padding so it clears the home indicator and sits above the on-screen keyboard. Desktop: orb centered with the transcript and composer arranged around it without crowding it. Pick the arrangement that keeps the orb dominant; do not shrink it to a corner badge.
- **Orb sizing.** Scale the canvas and point size off the smaller viewport dimension so the orb stays well-proportioned in portrait and landscape. Re-project and resize on viewport change and orientation change.
- **Performance scaling.** Cap `devicePixelRatio` at 2. Use a lower point count on small or low-power devices (for example around 2,200 on mobile versus around 4,200 on desktop) so phones hold framerate. Pause the render loop when the tab is hidden.
- **Input parity.** Pointer events for both mouse and touch. `touch-action: none` on the canvas so dragging the orb does not scroll the page, while the transcript still scrolls normally.
- **Reduced motion.** Honor `prefers-reduced-motion`: cut rotation and reduce breath and wobble amplitude.
- **Reachability.** Keyboard focus visible on the composer and controls. The send action is reachable without obscuring the orb.
- Verify at 375px, 768px, and 1280px, and in both orientations on mobile.

---

## LLM integration

- Route handler at `app/api/chat/route.ts` accepts the message history and streams the reply.
- Implement `lib/llm/provider.ts` as an interface with a single `stream(messages)` method returning an async iterable of text chunks. `lib/llm/anthropic.ts` implements it against the Anthropic API.
- The client consumes the stream and updates the last assistant message as chunks arrive, and switches the orb from `thinking` to `responding` on the first chunk.
- Configuration via env:
  - `ANTHROPIC_API_KEY`
  - `MERIZA_MODEL` (default to a current Claude Sonnet model, for example `claude-sonnet-4-6`; keep it a single env value so it is easy to change)
  - `MERIZA_SYSTEM_PROMPT` (optional, a default that gives Meriza a calm, concise voice)
- Never expose the key to the client. All model calls happen server side.
- Handle stream errors and aborts cleanly: surface a short in-interface message ("Lost the connection, try again"), return the orb to idle, and do not leave it stuck in thinking.

---

## Code quality bar

- Commit-ready and clean. No `// TODO`, no `// CHANGED`, no placeholder or narration comments. Comment only where intent is non-obvious.
- Idiomatic TypeScript and idiomatic React. Prefer the standard library and platform APIs over hand-rolled equivalents.
- No over-engineering. No abstractions that serve a phase you were told not to build. Small, readable files.
- Strong typing throughout, no `any` in app code.
- A README that covers prerequisites, env setup, local dev, and `docker compose up`, and documents the `<Orb />` props.

---

## Non-goals for now

- No auth, accounts, or multi-user.
- No database or server-side persistence.
- No separate backend service.
- No analytics or telemetry.
- No model fine-tuning or RAG.

---

## Definition of done

A user clones the repo, copies `.env.example` to `.env`, adds an Anthropic key, runs `docker compose up`, opens the app on desktop or phone, types a message, watches the orb move from idle to thinking to responding while the reply streams in, taps the orb to send a ripple, and the whole thing stays smooth and well-laid-out at any screen size.
