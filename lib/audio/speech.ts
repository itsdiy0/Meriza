import { takeChunk } from "@/lib/audio/chunk";
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
const FIRST_CHUNK_CHARS = 70;
const FIRST_MIN_CHUNK_CHARS = 30;

const LEAD_IN_SECONDS = 0.05;
const PREROLL_SECONDS = 1.5;
const DEBUG = process.env.NODE_ENV !== "production";

export interface SpeechHandlers {
  /** Fires as the first clip becomes audible, not when it is scheduled. */
  onStart?(source: AnalyserSource): void;
  /** Fires when every queued clip has finished playing. */
  onEnd?(): void;
  onError?(error: unknown): void;
}

export interface SpeechPlayer {
  /** Creates or resumes the AudioContext. Must run inside a user gesture. */
  unlock(): Promise<void>;
  /** Opens an utterance, superseding any in progress. */
  start(handlers?: SpeechHandlers): void;
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
 */
export function createSpeechPlayer(): SpeechPlayer {
  let ctx: AudioContext | null = null;
  let analyserNode: AnalyserNode | null = null;
  let source: AnalyserSource | null = null;

  let handlers: SpeechHandlers = {};
  let controller: AbortController | null = null;
  let generation = 0;

  let pending = "";
  const queue: string[] = [];
  let chunksTaken = 0;
  let synthesizing = false;
  let inputClosed = true;

  const clips = new Set<AudioBufferSourceNode>();
  let startTimer: ReturnType<typeof setTimeout> | null = null;
  let scheduled = 0;
  let played = 0;
  let nextStart = 0;
  let announced = false;

  const context = (): AudioContext => {
    if (ctx === null) ctx = new AudioContext();
    return ctx;
  };

  const teardown = () => {
    if (startTimer !== null) {
      clearTimeout(startTimer);
      startTimer = null;
    }
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
    queue.length = 0;
    chunksTaken = 0;
    synthesizing = false;
    inputClosed = true;
    scheduled = 0;
    played = 0;
    nextStart = 0;
    announced = false;
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
    const finished = handlers.onEnd;
    stop();
    finished?.();
  };

  const drain = () => {
    for (;;) {
      const first = chunksTaken === 0;
      const next = takeChunk(pending, {
        minChars: first ? FIRST_MIN_CHUNK_CHARS : MIN_CHUNK_CHARS,
        softMax: first ? FIRST_CHUNK_CHARS : ENGINE_CHUNK_CHARS,
        hardMax: ENGINE_CHUNK_CHARS,
        flush: inputClosed,
      });
      if (next === null) break;
      pending = next.rest;
      chunksTaken++;
      if (next.chunk !== "") queue.push(next.chunk);
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

  const schedule = (buffer: AudioBuffer, chars: number, synthMs: number) => {
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
    nextStart = when + buffer.duration;

    clips.add(clip);
    scheduled++;
    clip.onended = () => {
      clips.delete(clip);
      played++;
      maybeFinish();
    };

    if (DEBUG) {
      console.info(
        `[tts] #${scheduled} ${chars}c ` +
          `synth ${Math.round(synthMs)}ms ` +
          `audio ${buffer.duration.toFixed(1)}s ` +
          `lead ${lead.toFixed(1)}s` +
          (!first && lead < 0 ? `  GAP ${(-lead).toFixed(1)}s` : ""),
      );
    }

    if (!announced) {
      announced = true;
      const delayMs = Math.max(0, (when - audio.currentTime) * 1000);
      startTimer = setTimeout(() => {
        startTimer = null;
        handlers.onStart?.(motion);
      }, delayMs);
    }
  };

  const synthesize = async (text: string): Promise<ArrayBuffer> => {
    controller = new AbortController();
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
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
      const bytes = await synthesize(chunk);
      if (token !== generation) return;
      const buffer = await context().decodeAudioData(bytes);
      if (token !== generation) return;
      schedule(buffer, chunk.length, performance.now() - began);
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

    start(next = {}) {
      stop();
      handlers = next;
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