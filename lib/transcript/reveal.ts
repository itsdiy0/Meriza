interface Segment {
  text: string;
  words: number;
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

const countWords = (text: string) => (text.match(/\S+/g) ?? []).length;

/**
 * Paces text out to match speech. Each segment is revealed word by word across
 * the duration of the clip that speaks it, so the transcript reads at the rate
 * the orb is talking rather than arriving whole and waiting.
 *
 * The whole of a segment is published as soon as it arrives, alongside a count
 * of how many of its words are audible yet. The consumer holds the unspoken
 * remainder invisible rather than absent, which keeps its markdown parse and
 * its layout stable while the words appear inside it.
 *
 * Only one segment advances at a time. A new one completes whatever came
 * before it, which keeps the two in step when clips run back to back and lets
 * the text simply wait during the silence between them.
 */
export function createRevealer(
  onReveal: (text: string, visibleWords: number) => void,
): Revealer {
  let settled = "";
  let settledWords = 0;
  let active: Segment | null = null;
  let frameId = 0;

  let lastText = "";
  let lastVisible = -1;

  const emit = (text: string, visible: number) => {
    if (text === lastText && visible === lastVisible) return;
    lastText = text;
    lastVisible = visible;
    onReveal(text, visible);
  };

  const settle = () => {
    if (active === null) return;
    settled += active.text;
    settledWords += active.words;
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
    const progress = active.durationMs > 0 ? elapsed / active.durationMs : 1;

    if (progress >= 1) {
      const text = settled + active.text;
      const words = settledWords + active.words;
      settle();
      emit(text, words);
      frameId = 0;
      return;
    }

    emit(
      settled + active.text,
      settledWords + Math.floor(progress * active.words),
    );
    frameId = requestAnimationFrame(frame);
  };

  return {
    push(text, durationSeconds) {
      settle();
      active = {
        text,
        words: countWords(text),
        startMs: performance.now(),
        durationMs: durationSeconds * 1000,
      };
      // Published immediately with nothing visible, so the block is laid out
      // and parsed before its first word appears.
      emit(settled + text, settledWords);
      if (frameId === 0) frameId = requestAnimationFrame(frame);
    },

    flush() {
      stopLoop();
      settle();
      emit(settled, settledWords);
    },

    halt() {
      stopLoop();
      if (active !== null) {
        // Whatever was not spoken is dropped: the transcript records what was
        // said, so an interrupted reply stops where the voice stopped.
        settled += active.text.slice(0, active.text.length);
        active = null;
      }
      emit(lastText, lastVisible);
    },

    reset() {
      stopLoop();
      settled = "";
      settledWords = 0;
      active = null;
      lastText = "";
      lastVisible = -1;
      onReveal("", 0);
    },
  };
}