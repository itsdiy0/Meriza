import type { MotionFrame, MotionSource, Score } from "@/lib/orb/motion/types";

const REST: MotionFrame = { amplitude: 0, wobble: 0, ripple: false };

/**
 * Plays a score against the orb's clock. The first sampled time is taken as the
 * performance start, so playback follows the orb's elapsed time (which pauses
 * with the tab). No smoothing here; the orb lerps toward each beat. A ripple
 * fires once, on the frame playback first crosses into a ripple beat.
 */
export function createScoreSource(score: Score): MotionSource {
  const { beats, tickMs } = score;
  const total = beats.length;
  let start: number | null = null;
  let lastIndex = -1;
  let finished = total === 0;

  return {
    id: "score",
    get done() {
      return finished;
    },
    frame(elapsedSeconds: number): MotionFrame {
      if (start === null) start = elapsedSeconds;
      const i = Math.floor(((elapsedSeconds - start) * 1000) / tickMs);

      if (i >= total) {
        finished = true;
        return REST;
      }
      if (i < 0) return REST;

      const beat = beats[i];
      const crossed = i !== lastIndex;
      lastIndex = i;

      return {
        amplitude: beat.amp,
        wobble: beat.freq,
        ripple: crossed && beat.ripple === true,
      };
    },
  };
}