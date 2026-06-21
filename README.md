# Meriza

A presence-first conversational AI interface. The assistant has a body: a
living, breathing orb made of points that sits at the center of the screen. You
type, it listens, thinks, and responds, and the orb reflects each state through
motion and color. Dark by default, self-hostable, calm.

This is the Phase 1 MVP: one screen, a streamed Anthropic reply, and the orb
wired to the conversation lifecycle. Conversation lives in memory for the
session (no persistence yet).

## Prerequisites

- Node.js 20 or newer (22 recommended).
- An Anthropic API key.

## Environment

Copy the example file and fill in your key:

```bash
cp .env.example .env
```

| Variable               | Required | Default               | Purpose                                    |
| ---------------------- | -------- | --------------------- | ------------------------------------------ |
| `ANTHROPIC_API_KEY`    | yes      | —                     | Authenticates the server-side model calls. |
| `MERIZA_MODEL`         | no       | `claude-sonnet-4-6`   | The chat model.                            |
| `MERIZA_SYSTEM_PROMPT` | no       | a calm, concise voice | Sets Meriza's personality.                 |

The key is used only in the `app/api/chat` route handler and never reaches the
client.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000, type a message, and watch the orb move from idle to
thinking to responding while the reply streams in. Tap or click the orb to send
a ripple across its surface; drag to rotate it.

## Production build

```bash
npm run build
npm start
```

## Self-hosting with Docker

With `.env` in place:

```bash
docker compose up
```

This builds a single container (Next.js standalone output) and serves the app
on port 3000.

## Checks

```bash
npm run typecheck
npm run lint
```

## The `<Orb />` component

The orb owns its Three.js scene; React only feeds it props.

```ts
type OrbState = "idle" | "listening" | "thinking" | "responding";

interface OrbProps {
  state: OrbState; // drives motion and palette, eased internally
  amplitude?: number; // 0..1 live energy, used in Phase 2 for audio
  onTap?: () => void; // fires on a tap/click that hits the orb surface
}
```

State changes ease rather than snap: the component retargets its uniforms and
lerps toward them each frame. It caps `devicePixelRatio` at 2, uses fewer points
on small or touch devices, pauses rendering when the tab is hidden, and respects
`prefers-reduced-motion`. The GLSL lives in `lib/orb/shaders.ts` and the
per-state presets in `lib/orb/states.ts`.

## Not in Phase 1

No auth, no database or server-side persistence, no separate backend service, no
microphone or speech (Phase 2), no analytics. Reloading the page starts a fresh
conversation.
