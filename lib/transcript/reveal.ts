interface Segment {
    text: string;
    /** Character offset at the end of each word, for revealing one at a time. */
    ends: number[];
    startMs: number;
    durationMs: number;
  }
  
  export interface Revealer {
    /** Reveals `text` word by word across `durationSeconds`. */
    push(text: string, durationSeconds: number): void;
    /** Reveals everything held, at once. */
    flush(): void;
    /** Freezes at the current position, keeping what has been shown. */
    halt(): void;
    /** Clears everything and starts empty. */
    reset(): void;
  }
  
  /** Offsets just past each word, so a prefix can be taken without splitting. */
  function wordEnds(text: string): number[] {
    const ends: number[] = [];
    const word = /\S+/g;
    let match = word.exec(text);
    while (match !== null) {
      ends.push(match.index + match[0].length);
      match = word.exec(text);
    }
    return ends;
  }
  
  /**
   * Paces text out to match speech. Each segment is revealed word by word across
   * the duration of the clip that speaks it, so the transcript reads at the rate
   * the orb is talking rather than arriving whole and waiting.
   *
   * Only one segment advances at a time. A new one completes whatever came
   * before it, which keeps the two in step when clips run back to back and lets
   * the text simply wait during the silence between them.
   *
   * `onText` receives the whole revealed string, and only when it changes, which
   * is a few times a second rather than once a frame.
   */
  export function createRevealer(onText: (text: string) => void): Revealer {
    let settled = "";
    let active: Segment | null = null;
    let emitted = "";
    let frameId = 0;
  
    const emit = (text: string) => {
      if (text === emitted) return;
      emitted = text;
      onText(text);
    };
  
    const settle = () => {
      if (active === null) return;
      settled += active.text;
      active = null;
    };
  
    const stopLoop = () => {
      if (frameId === 0) return;
      cancelAnimationFrame(frameId);
      frameId = 0;
    };
  
    const frame = () => {
      if (active === null) {
        frameId = 0;
        return;
      }
  
      const elapsed = performance.now() - active.startMs;
      const progress =
        active.durationMs > 0 ? elapsed / active.durationMs : 1;
  
      if (progress >= 1) {
        settle();
        emit(settled);
        frameId = 0;
        return;
      }
  
      const shown = Math.floor(progress * active.ends.length);
      emit(settled + (shown > 0 ? active.text.slice(0, active.ends[shown - 1]) : ""));
      frameId = requestAnimationFrame(frame);
    };
  
    const run = () => {
      if (frameId === 0) frameId = requestAnimationFrame(frame);
    };
  
    return {
      push(text, durationSeconds) {
        settle();
        active = {
          text,
          ends: wordEnds(text),
          startMs: performance.now(),
          durationMs: durationSeconds * 1000,
        };
        run();
      },
  
      flush() {
        stopLoop();
        settle();
        emit(settled);
      },
  
      halt() {
        stopLoop();
        settled = emitted;
        active = null;
      },
  
      reset() {
        stopLoop();
        settled = "";
        active = null;
        emitted = "";
        onText("");
      },
    };
  }