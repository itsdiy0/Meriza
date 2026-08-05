import { takeChunk } from "@/lib/audio/chunk";
import {
  createAnalyserSource,
  type AnalyserSource,
} from "@/lib/orb/motion/analyser";

const FFT_SIZE = 1024;
const SMOOTHING = 0.6;
const FIRST_CHUNK_CHARS = 40;
const MAX_CHUNK_CHARS = 320;
const CHUNK_GROWTH = 2;
const LEAD_IN_SECONDS = 0.05;

export interface SpeechHandlers {
  /** Fires once per utterance, as the first clip is scheduled. */
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
  let scheduled = 0;
  let played = 0;
  let nextStart = 0;
  let announced = false;

  const context = (): AudioContext => {
    if (ctx === null) ctx = new AudioContext();
    return ctx;
  };

  const teardown = () => {
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
      // Chunks grow geometrically: the opening one is small so speech starts
      // quickly, and each one thereafter is long enough to cover the next
      // request. Holding the ratio near double keeps every handover ahead of
      // the engine, which renders roughly three times faster than realtime.
      const target = Math.min(
        FIRST_CHUNK_CHARS * CHUNK_GROWTH ** chunksTaken,
        MAX_CHUNK_CHARS,
      );
      const next = takeChunk(pending, target, inputClosed);
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

  const schedule = (buffer: AudioBuffer) => {
    const audio = context();
    const { analyser, motion } = graph(audio);

    const clip = audio.createBufferSource();
    clip.buffer = buffer;
    clip.connect(analyser);

    // Clamp to the present: if synthesis fell behind playback the cursor is
    // in the past, and a gap is better than a clip that never sounds.
    const when = Math.max(nextStart, audio.currentTime + LEAD_IN_SECONDS);
    clip.start(when);
    nextStart = when + buffer.duration;

    clips.add(clip);
    scheduled++;
    clip.onended = () => {
      clips.delete(clip);
      played++;
      maybeFinish();
    };

    if (!announced) {
      announced = true;
      handlers.onStart?.(motion);
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

    try {
      const bytes = await synthesize(chunk);
      if (token !== generation) return;
      const buffer = await context().decodeAudioData(bytes);
      if (token !== generation) return;
      schedule(buffer);
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