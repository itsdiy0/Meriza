# Plan-mode prompt: orb spoken-motion (text to motion score)

> Paste this into Claude Code in plan mode (`Shift+Tab` to plan, or `/plan`). Do not write any code. Read the real code first, ask me anything ambiguous, then produce a plan I can review and edit.

## Read first

Before planning anything, read the current implementation so the plan targets what actually exists:

- The `Orb` component and its prop signature (especially whether an `amplitude` input is already wired into the shader uniforms, or only stubbed).
- `lib/orb/shaders.ts` and `lib/orb/states.ts` to see how amplitude and wobble are currently driven, and how the render loop steps each frame.
- `CLAUDE.md` for the project rules.
- The Phase 1/2 spec doc in `docs/` for context on how this fits the wider plan.

Report back what amplitude wiring is already there before proposing new code. The orb is built and running; this feature is additive and must not regress the existing idle, listening, thinking, and responding states or the tap ripple.

## The idea

Turn an arbitrary text string into a deterministic "motion score": a list of evenly-spaced beats the orb plays back so it looks like it is speaking the text, with no audio and no model involved. The same string always produces the same performance. This is a third source of the orb's amplitude, alongside the live-audio analyser (future, from the TTS track) and plain idle breathing.

The seam I want is an `AmplitudeSource` abstraction so the orb's amplitude can come from one of:

- `idle` — resting breath, amplitude near zero (already effectively the default).
- `score` — the text-driven motion score (this feature).
- `analyser` — real spoken audio level (future, do not build now, just leave room for it).

All three resolve to the same 0..1 value the orb already consumes. Switching source must not require touching the orb's rendering code.

## Stage 1 (plan this in detail, this is what we build now)

A self-contained "paste a string, watch the orb read it" capability. No LLM, no TTS, no network.

- A `textToScore(text)` function that converts a string into a flat array of beats at a fixed tick interval (start around 80ms, make it a constant that is easy to tune). Each beat carries at least an amplitude (0..1), a wobble frequency, and an optional ripple flag.
- A tick player that steps through the score in time with the orb's existing render loop, lerping the orb's amplitude toward each beat's value so it breathes rather than strobes, and firing a ripple on flagged beats.
- A minimal dev surface (a text field plus a "speak" control) so I can paste any paragraph and watch the orb perform it. This is a developer-facing harness, keep it plain; it does not need to be the final UI.

Scoring rules as a starting point (refine if you have a better approach, but keep it fully deterministic from the string):

- Vowels get sustained, higher amplitude; consonants get shorter, lower amplitude. This is the cheap stand-in for visemes and is what makes it read as speech rhythm.
- Spaces are micro-rests, commas are short rests, sentence-ending punctuation is a longer rest plus a settling ripple. This gives phrasing.
- Hash each word to a stable value and map it to wobble frequency, so different words look different but the same word is always identical.
- A word occupies a number of ticks proportional to its length, while the tick interval itself stays fixed, so the array is uniform-interval and trivial for the player to step.

Edge cases the plan must address:

- Empty or whitespace-only input.
- Non-Latin scripts. The vowel/consonant rule is Latin-centric; Meriza may need to perform Persian/Farsi and other scripts, so define a sensible fallback (for example per-character amplitude derived from char code or Unicode category) so any string still produces a reasonable performance rather than going silent.
- Numbers and symbols.
- Very long paragraphs: decide whether to cap length, or generate the score lazily, so a huge string does not allocate a massive array up front.
- The player must integrate with the existing requestAnimationFrame loop rather than starting a second competing loop, and must pause when the tab is hidden, like the orb already does.

## Stage 2 (context only, do NOT build now)

Later, the string stops being something I paste and starts coming from sources: LLM responses (streamed token by token), OpenClaw, or any arbitrary text the app produces. The motion score then serves two roles: the no-audio fallback, and the pre-audio filler that plays while a reply streams in before TTS audio exists, after which the source switches to the `analyser`. Plan only far enough to make sure the Stage 1 seam (the `AmplitudeSource` switch and `textToScore` signature) will accept a streamed or externally-supplied string later without rework. Do not implement any source wiring, LLM, or TTS in this stage.

When designing the `AmplitudeSource` interface in Stage 1, treat the future `analyser` source (real spoken audio level, from the TTS track) as a first-class consumer of the same contract, not an afterthought. That means: all sources emit a per-frame target amplitude on an identical 0..1 scale with the same meaning of 0 (resting) and 1 (peak); smoothing and the frame loop are owned by the consumer (the orb or a shared hook), not re-implemented inside each source; and the active source can change mid-utterance, so the interface is designed for a crossfade rather than a hard cut. Do not implement the analyser, but the interface must accept it later with no changes to the orb or the score.

## Constraints

- Follow `CLAUDE.md`. Clean, commit-ready, no narration comments, strong typing, no em dashes.
- No over-engineering. Do not build the analyser source, streaming, or source wiring yet. Build the score source and the switch, nothing more.
- Deterministic: identical input gives identical motion. No randomness at play time.
- Keep `textToScore` pure and unit-testable, separate from the player and from React.
- Responsive and reduced-motion aware, consistent with the existing orb.

## What I want out of plan mode

A reviewable plan that lists: the files to create or change, the `AmplitudeSource` interface shape, where `textToScore` and the player live, how the player hooks the existing loop, the dev surface, how the edge cases above are handled, and the order of implementation. Surface any clarifying questions about the current orb code before finalizing, especially anything about how amplitude is currently fed to the shader.

## Reference (starting point for textToScore, not a constraint)

```ts
type Beat = { amp: number; freq: number; ripple?: boolean };

const VOWELS = new Set([..."aeiouy"]);
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function textToScore(text: string): Beat[] {
  const beats: Beat[] = [];
  const tokens = text.toLowerCase().match(/[a-z']+|[.,!?;:]+|\s+/g) ?? [];
  for (const tok of tokens) {
    if (/^\s+$/.test(tok)) { beats.push({ amp: 0.05, freq: 0.2 }); continue; }
    if (/^[.,!?;:]/.test(tok)) {
      const rest = /[.!?]/.test(tok) ? 3 : 2;
      for (let i = 0; i < rest; i++) beats.push({ amp: 0.04, freq: 0.15 });
      if (/[.!?]/.test(tok)) beats[beats.length - 1].ripple = true;
      continue;
    }
    const f = (hash(tok) % 100) / 100;
    for (let i = 0; i < Math.min(tok.length, 8); i++) {
      const ch = tok[i];
      const vowel = VOWELS.has(ch);
      beats.push({
        amp: vowel ? 0.6 + (ch.charCodeAt(0) % 5) / 12 : 0.25 + (ch.charCodeAt(0) % 4) / 16,
        freq: 0.3 + f * 0.6,
      });
    }
  }
  return beats;
}
```
