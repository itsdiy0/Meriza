import type { MotionFrame, MotionSource } from "@/lib/orb/motion/types";

const PULSE_HZ = 0.45;
const DRIFT_HZ = 0.17;
const AMP_LOW = 0.14;
const AMP_HIGH = 0.42;
const WOBBLE_LOW = 0.12;
const WOBBLE_HIGH = 0.22;

/** 0..1, starting at 0 so a fresh source enters from rest, not mid-pulse. */
const risingSine = (t: number, hz: number) =>
    0.5 - Math.cos(t * Math.PI * 2 * hz) * 0.5;

/**
 * Holds the orb between committing to a reply and the audio arriving. A slow,
 * even pulse, deliberately unlike speech: speech motion is syllabic and jagged,
 * this is smooth and periodic, so a silent orb reads as gathering rather than
 * as mouthing words it has not said yet.
 *
 * Never done. It plays until something replaces it.
 */
export function createWaitingSource(): MotionSource {
  let start: number | null = null;

  return {
    id: "waiting",
    done: false,

    frame(elapsedSeconds: number): MotionFrame {
      if (start === null) start = elapsedSeconds;
      const t = elapsedSeconds - start;

      return {
        amplitude: AMP_LOW + (AMP_HIGH - AMP_LOW) * risingSine(t, PULSE_HZ),
        wobble:
          WOBBLE_LOW + (WOBBLE_HIGH - WOBBLE_LOW) * risingSine(t, DRIFT_HZ),
        ripple: false,
      };
    },
  };
}