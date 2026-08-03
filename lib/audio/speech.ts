import {
    createAnalyserSource,
    type AnalyserSource,
  } from "@/lib/orb/motion/analyser";
  
  const FFT_SIZE = 1024;
  const SMOOTHING = 0.6;
  
  export interface SpeechPlayer {
    /** Creates or resumes the AudioContext. Must run inside a user gesture. */
    unlock(): Promise<void>;
    /**
     * Synthesizes `text` and starts playback, resolving with the motion source
     * once audio is running. Resolves null if a later call or `stop` supersedes
     * this one. `onEnded` fires when playback finishes on its own.
     */
    speak(text: string, onEnded?: () => void): Promise<AnalyserSource | null>;
    /** Halts playback and cancels any synthesis in flight. */
    stop(): void;
    /** Releases the AudioContext. Call on unmount. */
    dispose(): void;
  }
  
  /**
   * Owns the audio graph so motion sources stay pure readers. One clip plays at
   * a time; starting another supersedes whatever is playing or generating. The
   * AudioContext is created lazily because iOS Safari only honours a resume
   * that originates in a user gesture.
   */
  export function createSpeechPlayer(): SpeechPlayer {
    let ctx: AudioContext | null = null;
    let node: AudioBufferSourceNode | null = null;
    let source: AnalyserSource | null = null;
    let controller: AbortController | null = null;
    let generation = 0;
  
    const context = (): AudioContext => {
      if (ctx === null) ctx = new AudioContext();
      return ctx;
    };
  
    const teardown = () => {
      if (node !== null) {
        node.onended = null;
        try {
          node.stop();
        } catch {
          // Already stopped or never started; nothing to release.
        }
        node.disconnect();
        node = null;
      }
      source?.end();
      source = null;
    };
  
    const stop = () => {
      generation++;
      controller?.abort();
      controller = null;
      teardown();
    };
  
    return {
      async unlock() {
        const audio = context();
        if (audio.state === "suspended") await audio.resume();
      },
  
      async speak(text, onEnded) {
        const token = ++generation;
        controller?.abort();
        controller = new AbortController();
  
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`TTS request failed: ${res.status}`);
  
        const bytes = await res.arrayBuffer();
        if (token !== generation) return null;
  
        const audio = context();
        if (audio.state === "suspended") await audio.resume();
  
        const buffer = await audio.decodeAudioData(bytes);
        if (token !== generation) return null;
  
        teardown();
  
        const analyser = audio.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = SMOOTHING;
  
        const clip = audio.createBufferSource();
        clip.buffer = buffer;
        clip.connect(analyser);
        analyser.connect(audio.destination);
  
        const next = createAnalyserSource(analyser);
        clip.onended = () => {
          next.end();
          onEnded?.();
        };
        clip.start();
  
        node = clip;
        source = next;
        return next;
      },
  
      stop,
  
      dispose() {
        stop();
        void ctx?.close();
        ctx = null;
      },
    };
  }