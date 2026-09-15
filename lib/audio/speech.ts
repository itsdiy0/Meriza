import { takeChunk, type ChunkBoundary } from "@/lib/audio/chunk";
import { speakable } from "@/lib/audio/text";
import {
  createAnalyserSource,
  type AnalyserSource,
} from "@/lib/orb/motion/analyser";

const FFT_SIZE = 1024;
const SMOOTHING = 0.6;

/**
 * The engine splits anything longer than this internally and returns nothing
 * until every piece has rendered, so a request above it costs a multiple of
 * the latency for no gain. Matching it keeps one request to one generation.
 */
const ENGINE_CHUNK_CHARS = 120;
const MIN_CHUNK_CHARS = 60;
const STRUCTURAL_MIN_CHARS = 12;
const FIRST_CHUNK_CHARS = 70;
const FIRST_MIN_CHUNK_CHARS = 30;

/**
 * Silence left after a clip, by the kind of break it ended on. A forced split
 * lands mid-sentence, where any pause at all reads as a stutter.
 */
const BREATH_SECONDS: Record<ChunkBoundary, number> = {
  sentence: 0.1,
  line: 0.35,
  paragraph: 0.6,
  forced: 0,
  flush: 0,
};

const LEAD_IN_SECONDS = 0.05;
const PREROLL_SECONDS = 1.5;
const DEBUG = process.env.NODE_ENV !== "production";

interface QueuedChunk {
  /** Stripped text sent to the engine. */
  text: string;
  /** The same span as it was written, for display. */
  raw: string;
  boundary: ChunkBoundary;
}

export interface SpeechOptions {
  voice?: string;
  speed?: number;
}

let options: SpeechOptions = {};

export interface SpeechHandlers {
  /** Fires as the first clip becomes audible, not when it is scheduled. */
  onStart?(source: AnalyserSource): void;
  /**
   * Fires as each clip becomes audible, carrying the text that clip speaks as
   * it was originally written and how long it will take to say. Concatenating
   * every payload in order reproduces the text that was pushed.
   *
   * A span that produced no speech, a rule or a table divider, rides along
   * with the next spoken chunk, and any trailing remainder arrives in a final
   * call with zero duration just before `onEnd`.
   */
  onChunk?(text: string, durationSeconds: number): void;
  /** Fires when every queued clip has finished playing. */
  onEnd?(): void;
  onError?(error: unknown): void;
}

export interface SpeechPlayer {
  /** Creates or resumes the AudioContext. Must run inside a user gesture. */
  unlock(): Promise<void>;
  /** Opens an utterance, superseding any in progress. */
  start(handlers?: SpeechHandlers, options?: SpeechOptions): void;
  /** Adds text. Partial sentences are held until they complete. */
  push(text: string): void;
  /** Closes input. The utterance ends once the queue drains and plays out. */
  end(): void;
  /** Halts playback and cancels synthesis without firing handlers. */
  stop(): void;
  /** Releases the AudioContext. Call on unmount. */
  dispose(): void;
}

/**
 * Speaks text as it arrives. Complete sentences are synthesized one at a time
 * and scheduled back to back on the AudioContext clock, so the first clip can
 * start while later text is still being written or rendered. Every clip feeds
 * one analyser that lives for the whole utterance, so the orb sees a single
 * handover rather than one per sentence.
 *
 * Chunks are held near a constant size: the engine renders at roughly half of
 * realtime whatever it is given, so each clip buys about twice the time the
 * next one costs, and playback stays ahead without the pace drifting between
 * utterances. The opening clip is smaller for a quicker start and scheduled a
 * short way into the future, which covers the one handover with no backlog
 * behind it.
 *
 * Because a clip's audible moment is known the instant it is scheduled, the
 * player is also the clock anything following the speech should run on.
 */
export function createSpeechPlayer(): SpeechPlayer {
  let ctx: AudioContext | null = null;
  let analyserNode: AnalyserNode | null = null;
  let source: AnalyserSource | null = null;

  let handlers: SpeechHandlers = {};
  let controller: AbortController | null = null;
  let generation = 0;

  let pending = "";
  let carriedRaw = "";
  const queue: QueuedChunk[] = [];
  let chunksTaken = 0;
  let synthesizing = false;
  let inputClosed = true;

  const clips = new Set<AudioBufferSourceNode>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let scheduled = 0;
  let played = 0;
  let nextStart = 0;

  const context = (): AudioContext => {
    if (ctx === null) ctx = new AudioContext();
    return ctx;
  };

  const teardown = () => {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    for (const clip of clips) {
      clip.onended = null;
      try {
        clip.stop();
      } catch {
        // Scheduled but never started; nothing to halt.
      }
      clip.disconnect();
    }
    clips.clear();
    analyserNode?.disconnect();
    analyserNode = null;
    source?.end();
    source = null;
    pending = "";
    carriedRaw = "";
    queue.length = 0;
    chunksTaken = 0;
    synthesizing = false;
    inputClosed = true;
    scheduled = 0;
    played = 0;
    nextStart = 0;
  };

  const stop = () => {
    generation++;
    controller?.abort();
    controller = null;
    handlers = {};
    teardown();
  };

  const maybeFinish = () => {
    if (!inputClosed || synthesizing) return;
    if (pending.trim() !== "" || queue.length > 0) return;
    if (played < scheduled) return;

    // Captured before teardown clears them.
    const finished = handlers.onEnd;
    const chunked = handlers.onChunk;
    const tail = carriedRaw;

    stop();

    if (tail !== "") chunked?.(tail, 0);
    finished?.();
  };

  const drain = () => {
    for (;;) {
      const first = chunksTaken === 0;
      const next = takeChunk(pending, {
        minChars: first ? FIRST_MIN_CHUNK_CHARS : MIN_CHUNK_CHARS,
        structuralMinChars: STRUCTURAL_MIN_CHARS,
        softMax: first ? FIRST_CHUNK_CHARS : ENGINE_CHUNK_CHARS,
        hardMax: ENGINE_CHUNK_CHARS,
        flush: inputClosed,
      });
      if (next === null) break;

      pending = next.rest;
      chunksTaken++;

      // A span of nothing but markup or emoji has no clip of its own to be
      // revealed against, so it waits and rides along with the next one.
      const text = speakable(next.chunk);
      if (text === "") {
        carriedRaw += next.raw;
        continue;
      }

      queue.push({
        text,
        raw: carriedRaw + next.raw,
        boundary: next.boundary,
      });
      carriedRaw = "";
    }
  };

  const graph = (audio: AudioContext) => {
    if (analyserNode !== null && source !== null) {
      return { analyser: analyserNode, motion: source };
    }
    const analyser = audio.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = SMOOTHING;
    analyser.connect(audio.destination);
    const motion = createAnalyserSource(analyser);
    analyserNode = analyser;
    source = motion;
    return { analyser, motion };
  };

  const schedule = (
    buffer: AudioBuffer,
    chunk: QueuedChunk,
    synthMs: number,
  ) => {
    const audio = context();
    const { analyser, motion } = graph(audio);

    const clip = audio.createBufferSource();
    clip.buffer = buffer;
    clip.connect(analyser);

    // Audio still queued ahead of now. Negative means the pipeline fell
    // behind and the listener hears a gap.
    const lead = nextStart - audio.currentTime;
    const first = scheduled === 0;
    const earliest =
      audio.currentTime + (first ? PREROLL_SECONDS : LEAD_IN_SECONDS);
    const when = Math.max(nextStart, earliest);

    clip.start(when);
    nextStart = when + buffer.duration + BREATH_SECONDS[chunk.boundary];

    clips.add(clip);
    scheduled++;
    clip.onended = () => {
      clips.delete(clip);
      played++;
      maybeFinish();
    };

    if (DEBUG) {
      console.info(
        `[tts] #${scheduled} ${chunk.text.length}c ` +
          `${chunk.boundary} ` +
          `synth ${Math.round(synthMs)}ms ` +
          `audio ${buffer.duration.toFixed(1)}s ` +
          `lead ${lead.toFixed(1)}s` +
          (!first && lead < 0 ? `  GAP ${(-lead).toFixed(1)}s` : ""),
      );
    }

    // Announce on the audio clock rather than on arrival, so anything
    // following the speech is aligned to what is actually being heard.
    const delayMs = Math.max(0, (when - audio.currentTime) * 1000);
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (first) handlers.onStart?.(motion);
      handlers.onChunk?.(chunk.raw, buffer.duration);
    }, delayMs);
    timers.add(timer);
  };

  const synthesize = async (text: string): Promise<ArrayBuffer> => {
    controller = new AbortController();
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, ...options }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`TTS request failed: ${res.status}`);
    return res.arrayBuffer();
  };

  const pump = async () => {
    if (synthesizing) return;
    const chunk = queue.shift();
    if (chunk === undefined) {
      maybeFinish();
      return;
    }

    synthesizing = true;
    const token = generation;
    const began = performance.now();

    try {
      const bytes = await synthesize(chunk.text);
      if (token !== generation) return;
      const buffer = await context().decodeAudioData(bytes);
      if (token !== generation) return;
      schedule(buffer, chunk, performance.now() - began);
    } catch (error) {
      if (token !== generation) return;
      const failed = handlers.onError;
      stop();
      failed?.(error);
      return;
    } finally {
      if (token === generation) synthesizing = false;
    }

    drain();
    void pump();
  };

  return {
    async unlock() {
      const audio = context();
      if (audio.state === "suspended") await audio.resume();
    },

    start(next = {}, spoken = {}) {
      stop();
      handlers = next;
      options = spoken;
      inputClosed = false;
    },

    push(text) {
      if (inputClosed) return;
      pending += text;
      drain();
      void pump();
    },

    end() {
      if (inputClosed) return;
      inputClosed = true;
      drain();
      void pump();
    },

    stop,

    dispose() {
      stop();
      void ctx?.close();
      ctx = null;
    },
  };
}