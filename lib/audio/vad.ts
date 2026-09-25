/** How often the level is sampled. Fine enough to catch a short word. */
const TICK_MS = 30;

export interface VadOptions {
  /** Level above which audio counts as speech, 0..1. */
  threshold: number;
  /** Speech must hold for this long before an utterance opens, so a door or
   *  a key press does not start one. */
  onsetMs: number;
  /** Silence must hold for this long before it closes. This is the number
   *  that decides whether Talk mode feels good: too short cuts people off
   *  mid-thought, too long makes every reply feel sluggish. */
  hangoverMs: number;
  /** Below this an utterance is discarded, since nothing was said. */
  minSpeechMs: number;
}

export const DEFAULT_VAD: VadOptions = {
  threshold: 0.08,
  onsetMs: 120,
  hangoverMs: 800,
  minSpeechMs: 300,
};

export interface VadHandlers {
  /** An utterance began. */
  onStart?(): void;
  /** An utterance ended, having run for `durationMs`. */
  onEnd?(durationMs: number): void;
  /** Every tick, for meters and tuning. */
  onTick?(level: number, speaking: boolean): void;
}

export interface Vad {
  stop(): void;
}

/**
 * Decides when someone starts and stops talking, from a level reader.
 *
 * Energy thresholding rather than a model: it hears loudness rather than
 * speech, so a door or a keyboard can open an utterance. Whether that matters
 * depends entirely on the room, which is why this ships behind a harness
 * rather than behind an assumption. The interface is the part worth keeping,
 * so a better detector can replace the inside of the loop.
 *
 * The hysteresis matters more than the threshold. Speech has gaps in it, at
 * every stop consonant and between words, so a detector that closes on the
 * first quiet frame would chop a sentence into pieces. Onset guards the start
 * against transients, hangover guards the end against pauses.
 */
export function createVad(
  level: () => number,
  handlers: VadHandlers,
  options: VadOptions = DEFAULT_VAD,
): Vad {
  let speaking = false;
  let startedAt = 0;
  // When the current run of above or below threshold audio began. Whichever
  // state we are in, this is the clock the transition is waiting on.
  let since = performance.now();

  const timer = setInterval(() => {
    const now = performance.now();
    const current = level();
    const loud = current >= options.threshold;

    if (loud === (speaking ? true : false) === false) {
      // Sustained in the state we are not in; the run continues.
    }

    if (!speaking) {
      if (!loud) {
        since = now;
      } else if (now - since >= options.onsetMs) {
        speaking = true;
        startedAt = now - options.onsetMs;
        since = now;
        handlers.onStart?.();
      }
    } else {
      if (loud) {
        since = now;
      } else if (now - since >= options.hangoverMs) {
        speaking = false;
        const duration = since - startedAt;
        since = now;
        if (duration >= options.minSpeechMs) handlers.onEnd?.(duration);
      }
    }

    handlers.onTick?.(current, speaking);
  }, TICK_MS);

  return {
    stop() {
      clearInterval(timer);
    },
  };
}