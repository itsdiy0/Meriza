# Decisions

Standing calls and why. Written so that coming back after a month does not mean
re-deriving everything, and so that a guess is never mistaken for a measurement.

Newest at the bottom of each section.

## Product

**The orb is the body, not a visualizer.** It carries the personality and
reflects the model lifecycle at every screen size. Everything else in the UI
stays quiet. This is the premise, not a style preference: an orb that only
reacts to volume is a visualizer, and the project is not interesting if it
stops there.

**Presence-first rules out filler sounds.** A beep or hold tone to cover
synthesis latency was considered and rejected. Covering a visual dead spot with
a sound inverts the premise. A short cue at the moment audio starts would be
acceptable, since that marks a transition rather than filling a gap.

**Bring your own key, local first.** No backend of ours, no accounts. The user
supplies an LLM key and points at a TTS engine.

**Replies are written for the ear.** The system prompt asks for spoken numeric
forms, short answers, and minimal structure, because a listener cannot skim,
scan ahead, or skip a paragraph. This trades transcript scannability for
listening quality, deliberately.

It is also the reason there is no numeric normalizer in the speech path. A
first attempt expanded `$400B` into "four hundred billion dollars" on the way
to the engine, which was solving the problem at the wrong end: the notation was
already worse on screen than the spoken form would have been. Asking the model
for the spoken form fixes both surfaces at once. Markdown is the opposite case,
wanted on screen and never in speech, so stripping is the only option there.

**The seven phases.** Presence, voice out, the shell, ears, continuity,
homelab, expression. Tracked as GitHub milestones. Worth knowing the ordering
was chosen for momentum rather than for user value: persistence is less fun
than a settings panel and worth more, and the defining feature of a voice-first
product is four phases out.

## Motion

**One amplitude contract.** Every motion source emits a per-frame target on the
same 0..1 scale. Smoothing and the frame loop live in the consumer, never in
the source. A source owns no timers and no `requestAnimationFrame`.

**`frame` is called at most once per source per rendered frame.** `ripple` is
edge state, so a second read in the same frame consumes it. This is why
`AmplitudeSource` and its `sample()` method were removed: two read paths on one
object silently ate ripples.

**Score is an audio alternative, not a synthesis filler.** *Revised during
Phase 2.* The original plan was for the motion score to fill the gap while
audio generated, then crossfade to the analyser. That does not work. A score is
a performance of the reply text, so playing it before the audio means the orb
mimes the opening of a sentence that the voice then says from the beginning,
permanently offset by the synthesis latency. It reads as broken audio, not as
waiting.

A dedicated `waiting` source covers the gap instead: a slow, even pulse,
deliberately unlike speech. Score and analyser are alternatives for driving the
orb, not a sequence. Score remains useful for tuning the beat generator without
the engine in the loop, and for any future muted mode.

**Every mixer entry fades, including the first.** With nothing outgoing, the
blend starts from rest, whose wobble maps onto the orb's resting frequency.
Without this, a source starting while uniforms are still settling from the last
utterance yanks them and produces a visible jolt.

**Sources cannot suppress preset-owned uniforms.** A motion source drives only
`uEnergy` and `uWobbleFreq`. Breath, wobble amplitude, and their speeds come
from `ORB_STATES` every frame regardless. This is why `waiting` needed its own
state preset: no amount of source tuning can quiet a breath the source does not
control.

**A source starts from rest, not mid-cycle.** The waiting pulse uses a rising
cosine rather than a sine, so its first frame asks for the low end of its range
instead of the midpoint. Entering at half amplitude against an idle orb is a
visible pop.

## TTS

**Provider pattern, engine outside the repo.** Thin client behind
`TTSProvider`, OpenAI-compatible, reached by base URL. Swapping engines is an
env change and nothing more: moving from Chatterbox to Kokoro touched three
lines of `.env` and no application code.

**Content type is derived from the interface, not asserted at the route.**
`TTSProvider.contentType` exists so the response header and the requested
`response_format` cannot drift apart. The route depends on the interface; the
one line naming the concrete engine lives in `getProvider`.

**The voices response shape is not portable, so it is normalized.** Chatterbox
returns a bare string, Kokoro an array of `{id, name}` objects, and either may
be wrapped in a `voices` key. `readVoices` accepts all of them. The original
implementation assumed one shape and returned an empty array for anything else,
silently, for months. An engine-swappable client cannot assume a payload shape.

**Voice identifiers never port between engines.** Chatterbox took a reference
filename, Kokoro takes a voicepack id. Any stored voice is engine-specific and
has to be re-picked on a swap.

**Kokoro is the engine, chosen for latency rather than for hardware.**
*Revised.* The original reasoning was that the mini PC has no GPU, so only a
small model would do. That is no longer the constraint, since the engine may
end up on an external box, which would reopen Chatterbox. Kokoro stays anyway:
82M parameters against roughly half a billion makes it dramatically faster, and
after the system prompt rewrite the replies are short enough that raw voice
quality matters less than responsiveness.

The cost is still real. Chatterbox clones zero-shot from a reference file;
Kokoro ships 68 fixed voicepacks and cannot clone. Blending partially recovers
this: a plus-separated voice id averages the packs, so `af_bella+af_kore` is a
speaker no preset provides. That is the closest thing to a voice that is
specifically Meriza's.

**Chunk at 120 characters.** Chatterbox split anything longer internally and
returned nothing until every piece finished, so a larger request cost a
multiple of the latency for no gain. Matching its internal size kept one
request to one generation.

Worth knowing this is now an inherited constant with no measured basis. Whether
Kokoro splits internally has not been checked, and if it does not, the chunker
is paying per-request overhead for nothing and larger chunks would mean fewer
seams. Re-measure before tuning.

**Chunk sizes are bounded on both sides.** Roughly a second of fixed overhead
attached to every Chatterbox request, so a very short chunk barely broke even
against the audio it returned. The floors are 60 characters for prose and 25
for structural breaks.

Caveat: those floors are measured against the raw buffer, but the engine
receives the stripped text, so real requests run shorter than the constants
suggest. A terse markdown list has produced 22 to 31 character requests.
Playback still stayed ahead, so this is documented rather than fixed.

**A structural break ends a chunk on sight, ahead of any packing.** Silence
between list items or paragraphs can only be scheduled between clips, so two
items sharing one clip lose the division no matter how they are punctuated.
Terminating periods handle intonation inside a clip; scheduled gaps handle the
rest. This is why lists read as lists.

**Seed was tried and dropped.** Chatterbox accepted a `seed` parameter, and the
theory was that fixing it would hold the voice steady across chunk boundaries.
Tested at seed 12345 against seed 0: no audible difference. It cloned from the
reference file, and that conditioning is what fixed speaker identity; sampling
only nudged prosody. The parameter would have been a knob nobody tunes.

**Chatterbox did not stream, Kokoro does.** Confirmed for Chatterbox from its
OpenAPI schema, which had no `stream` field at all. Note that FastAPI silently
drops unknown fields, so sending one and getting a normal response proves
nothing; check the schema, not the response.

`synthesize(): Promise<ArrayBuffer>` therefore now understates what the engine
can do. That signature is what has to change if progressive playback ever
matters, and streaming would eventually replace the chunk queue with something
simpler and seamless.

**WAV is hardcoded, and that only holds on localhost.** The engine also offers
mp3. WAV is roughly ten times the bytes, which is free over a loopback and is
not once the engine moves to an external server.

## Speech text

**Markdown is stripped per chunk, not per delta.** A streamed delta can split
an emphasis marker in half; a chunk is always at least one whole sentence.

**Bullet markers go, ordered numbers stay.** Nobody reads "hyphen" aloud, but
in a ranked list the number is the content, and without it a listener cannot
tell third place from eighth.

**Emoji are stripped from speech and kept in the transcript.** They are the
clearest signal the model gives about intended tone, which Phase 7 will want
for driving the orb. Removing them at the source would throw that away.

**Tables are read as rows.** Cells joined by commas, the divider row skipped
entirely, and cells holding no letters or digits dropped, which removes the `#`
a rank column is usually headed with.

**Fenced code is shown and never spoken.** `speakable` carries a flag across
lines so the contents are dropped rather than only the delimiters. A code block
takes one reveal ordinal and appears as a unit, since there is no cadence to
follow. A chunk that is only code produces no clip, so the system prompt asks
for a sentence introducing it; otherwise a reply that is only code would speak
nothing at all.

**`speakable` stays even though the prompt mostly removes its input.** The
prompt is a request; the stripper is a guarantee. Models drift in long
conversations, a table is still produced when one is asked for, and swapping
`MERIZA_MODEL` changes formatting habits entirely.

**Four patches in a row on the same file is the signal to stop patching.**
Emoji, then bullets, then tables, then notation. If a fifth markdown construct
turns up, the answer is a real parser walking an AST, not another regex.

## Measurements

Taken 2026-08-05 against **Chatterbox-Turbo**, M4, MPS, single reference voice,
on the engine directly rather than through the Next route. Kept because they
are what every chunking constant was derived from, and because Chatterbox
remains viable if the engine ever lands on a GPU box.

| What | Value |
|---|---|
| Cold start penalty | ~2.2s, one time per engine process |
| First request after restart | 8.6s for 320 chars |
| Warm median | 6.4s for 320 chars |
| Real-time factor | ~0.5 (renders about twice as fast as it plays) |
| Fixed per-request overhead | ~1s |
| Engine internal chunk size | 120 chars |

**Kokoro has not been measured.** It is obviously far faster by ear, but no
numbers have been taken, and the constants above are still in force. Before
tuning anything, measure: real-time factor, per-request overhead, whether it
chunks internally, and time to first byte against total.

**Mac numbers say nothing about the deployment target.** MPS on an M4 and a
CPU box are an order of magnitude apart. Whatever machine eventually runs the
engine needs its own measurements.

**The 27 second cold start in the old notes was wrong.** It was a one-time
Metal shader compile, since cached, or a first-run model download. Not a
recurring cost.

**One unexplained throttle observed.** Mid-session, Chatterbox dropped from
roughly 60 iterations per second to 7.5 for about 45 seconds, then recovered on
its own. A 70 character request took 30 seconds, roughly 15x its normal cost.
Thermal or memory pressure are the likely causes. No client-side scheduling
defends against it. Seen once.

## Client

**Generation and speech are separate states.** A single `busy` flag covered
both while audio did not outlive the request. It does now, so `generating` ends
when the text stream closes and `speaking` continues until the last clip
finishes. The composer never locks: sending mid-reply interrupts and starts the
next turn, and interruption is most of what makes a voice interface feel
responsive.

**Stop is one control with two jobs.** It ends generation, synthesis, and
playback wherever the turn has reached. It is also the escape hatch for the
locked reading speed below, which is why it earns its place in the composer
rather than living somewhere quieter.

**The transcript records what was said, not what was written.** Deltas are
buffered rather than displayed, and text appears paced by the player's chunk
events, word by word across the duration of the clip speaking it. Stopping
keeps the spoken portion and discards the rest, and a turn cut off before it
spoke at all leaves no reply, its empty message removed rather than left
labelled and blank.

The cost is real: the model wrote a full answer and it is thrown away, with no
persistence to recover it. Defensible because the user chose to stop, but a
"show the rest" affordance may still be worth having.

An earlier version dumped the full text on stop, to avoid the empty bubble.
That was worse: it mounted hundreds of words at once, which flashes rather than
reveals, and it broke the one rule that makes the transcript coherent.

**Reading speed is locked to speaking speed, deliberately.** A long reply now
takes minutes to read where it used to take seconds. This is correct for a
voice-first product and it is the reason the stop button is load-bearing rather
than a nicety.

**The audio graph belongs to the player, not to motion sources.** The analyser
source is a pure reader. One analyser spans a whole utterance rather than one
per clip, so the mixer sees a single handover per reply.

**Clips are scheduled on the AudioContext clock, not started on arrival.**
`nextStart` accumulates buffer durations, giving sample-accurate gapless
playback. If synthesis falls behind, the cursor lands in the past and is
clamped to the present, trading a gap for a clip that would never sound.

**The first clip is prerolled.** Chunk sizes follow sentence structure, not the
requested targets, so an early chunk can overshoot badly enough to arrive after
the one before it has played out. Starting a short way in the future absorbs
that. Worth revisiting on a fast engine, where 1.5 seconds may now be most of
the time to first audio.

**The player is the clock for anything following the speech.** Because a clip's
audible moment is known the instant it is scheduled, chunk events fire on a
timer aligned to that moment rather than on arrival. Nothing else in the app
knows when a given word becomes audible.

Chunk payloads carry the untrimmed original text, and a span that produced no
speech, a rule or a table divider, rides along with the next spoken chunk.
Concatenating every payload in order therefore reproduces exactly what was
pushed, which is what makes the paced transcript possible. Trimmed text would
collapse a list into a paragraph.

**Voice and pace are captured when an utterance starts.** Changing either
applies from the next message, never mid-sentence. They are read through a ref
rather than closed over, so `send` does not rebuild on every settings change;
the first attempt put them in its dependency array and the change landed a
turn late.

**Revealed words are keyed positionally.** The revealed string only ever grows,
so a word keeps its index for the life of the message: already-visible words
stay mounted and still, and only newly added ones run their fade. Any keying
scheme that reorders would re-animate settled text.

The whole of a chunk is published as soon as it arrives, with a count of how
many words are audible yet, and the unspoken remainder held invisible rather
than absent. That keeps the markdown parse and the layout stable while words
appear inside it, and removes the reflow jitter of appending.

## Layout

**The conversation anchor is padding.** A fresh exchange opens a quarter down
the page and grows downward from there. This took four attempts, and everything
except padding failed for the same reason: a spacer div gets scrolled away, an
offset top edge moves when the box grows, and a scroll position gets clamped
when there is little to scroll. Padding is layout, so nothing can consume it.

Bottom padding matches the fade region for the same reason. Without it, the
scroll maximum leaves the last line under the composer, where the mask hides it
even though it is technically in view. A fade is paint, not a boundary.

**The real bug was never the anchor.** Outgoing messages stayed mounted at zero
opacity and kept their height, pushing each new exchange down by exactly one
exchange. The exit timer depended on a derived array, so its cleanup cancelled
it every render and it never fired. The outgoing exchange now renders out of
flow entirely, so a stuck exit cannot displace anything again.

**Columns are positioned by insetting one side, not by width.** The orb sizes
its canvas and camera off its container, so shrinking the element shrinks the
orb. Pinning it to one half keeps it the same size and slides it. Note that
percentage padding on a wrapper does nothing for an absolutely positioned
child, since `inset-0` resolves against the padding box: the transcript needed
the same treatment rather than inheriting it.

**The layout control is chrome, not a setting.** It moved out of the modal into
a segmented control in the corner, because it is switched often enough that a
modal round trip is tedious. Settings holds what is set once and left.

## Storage

**IndexedDB, not localStorage.** Settings live in localStorage and that is
fine, but a conversation log is different: localStorage is synchronous, so
every read blocks the main thread while the orb renders; it caps around 5MB,
which a few dozen conversations fill; and it stores strings only, so every
write is a JSON round trip. IndexedDB is async, has quota in the hundreds of
megabytes, stores structured values, and can index.

`idb` is the one dependency taken here. About 1KB to promisify an API that is
otherwise event-based and unpleasant enough that everyone wraps it.

**Messages are stored separately from conversations, not nested.** The
assistant message is appended to repeatedly while a reply reveals, and
rewriting a whole conversation record on every update is the difference
between smooth and not. An index on `conversationId` means opening one does
not scan every message in the database.

**State is the source of truth and the store is a mirror.** Reading back from
IndexedDB was never an option: the assistant message is rewritten several times
a second while a reply is revealed. Writes are fire and forget, since a failed
one costs the durable copy of one message and blocking the reveal on a database
round trip would cost more.

**Write cadence is the user message immediately and the assistant message on
each chunk event.** A handful of writes per reply rather than hundreds for
every revealed word, and nothing lost if the tab closes mid-reply. What is
stored is what was said, consistent with the transcript: an interrupted reply
persists the spoken portion and an unspoken one is deleted.

**Message position comes from the conversation, not a counter.** The first
implementation handed out incrementing indices and kept them in a map. Deleting
an unspoken reply removed its map entry without giving the position back, so
every discarded reply shifted everything after it, and replies started
appearing under the wrong prompt. Position is now the index in `messages`,
which has nothing to get out of step: a re-write always lands in the same
place, and a restored conversation needs no bookkeeping at all.

Note `save` is called from `send` before React has committed, so the mirror ref
is synced explicitly with the array being set.

**The upgrade path wipes rather than migrates.** Bumping the store version
discards everything, deliberately: this is a conversation log, not records
anyone has invested in, and per-shape migrations are a maintenance cost with no
matching value. Export exists to make that survivable, and is the only copy
that outlives clearing site data or moving machines.

**Erase leaves settings alone.** `clearAll` touches only IndexedDB. Conflating
a conversation wipe with losing a chosen voice would be a bad surprise.

**Three bugs, all the same shape.** A long-lived object holding stale state,
which is worth naming because it has now happened four times across the
project:

- The revealer is constructed once and captured the first `writeReply`, from a
  render where the conversation id was still null. Its `save` returned early
  forever, so no assistant message was ever written, while user messages worked
  because `send` calls `save` directly.
- Voice and pace were closed over in `send`, whose dependency array did not
  include them, so a change landed a turn late.
- The transcript's exit timer depended on a derived array, so its cleanup
  cancelled it every render and outgoing messages never unmounted.

The pattern: anything created once and given a callback needs a ref
indirection, and anything with a timer needs a dependency array that only
contains stable values.

**A restored conversation opens with its history visible.** Nothing is
generating, so there is no current exchange, only history. Focus mode takes
over from the next turn.

**Conversation switching is an overlay, not a sidebar.** Scrolling is
continuous and switching is discrete selection, so folding it into the existing
spiral gesture was considered and rejected: it would mean scrolling past fifty
messages to reach the previous conversation, and would still need names, dates
and delete. Permanent chrome would also compete with the orb for a whole
session to serve a moment.

Switching or starting a conversation ends the current turn first, since a reply
belongs to the conversation it was generated in and would otherwise keep
writing into the one being left.

**Titles are generated, with the truncated first message as a fallback.** A
list of rows reading "New conversation" is unusable, and "Persian Poets" beats
"most famous persian poeterys". The call runs without Meriza's system prompt: a
title is a label, not something she says, and her voice would produce "Well,
that one was about Persian poets."

Named after the reply is spoken rather than generated, consistent with the
rest of the app. Models add quotes and trailing punctuation regardless of
instruction, so the route strips both and rejects anything over 70 characters
rather than putting a sentence in the sidebar.

This is the first thing Meriza does with a model that is not part of the
conversation, which is why `LlmProvider` gained `complete`. There will be more
of them.

## Process

**No em dashes.** Anywhere, prose or code.

**No narration comments.** No `// CHANGED`, `// TODO`, `// NEW`. Comments
explain why, not what changed.

**Small imperative commits, one logical change each.** `type(scope): action`.

**Issue-based, and branch-based from Phase 3.** Every change belongs to an open
issue, closed with a comment describing what actually shipped. Work routinely
exceeds its written scope, and a bare "done" hides the decisions that came with
it: the structural-pause issue also delivered table reading, ordered numbers,
and a system prompt rewrite.

**Audit before building after a break.** Re-establishing ground truth is
cheaper than discovering halfway through a refactor that the docs were stale.
This file exists because of that, and the two plan-mode prompts deleted at the
end of Phase 2 are why it needs to stay current: both described an
`AmplitudeSource` abstraction and a score-as-filler design that had already
been reversed, and an agent reading them would have rebuilt exactly the thing
that did not work.

**The palette is transformed, never replaced.** `ORB_STATES` is tuned as a
set: cool teal at rest, violet while thinking, warm amber while speaking. That
progression is how a state change reads at a glance, without anyone learning
what the colours mean. So theme control is hue rotation, a saturation
multiplier, and a lightness offset, all applied identically to every state.

Per-state colour pickers were the obvious alternative and were rejected: they
let all four states be set to the same blue, which silently removes the signal.
Preserving the relationships matters more than absolute control.

The operations differ because the properties do. Saturation multiplies, so 0 is
a genuinely grey orb and 1 leaves the presets untouched; offsetting would push
every state toward the same saturation and flatten the contrast. Lightness
offsets, because multiplying a value already near zero barely moves it while a
bright one blows out. Hue wraps, being circular.

Note the colour helpers reuse module-level scratch objects, because
`Color.getHSL` writes into a target you pass rather than allocating, and these
run in the render loop. The returned colour is therefore shared: read it before
calling again, or clone it.