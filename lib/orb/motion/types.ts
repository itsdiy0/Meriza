/** One step of a motion score, played at a fixed tick interval. */
export interface Beat {
  /** Target amplitude, 0..1 (0 resting, 1 peak). */
  amp: number;
  /** Wobble-frequency drive, 0..1; the orb maps it onto a frequency range. */
  freq: number;
  /** When true, the orb fires a settling ripple as this beat begins. */
  ripple?: boolean;
}

/** A deterministic performance: evenly-spaced beats at `tickMs`. */
export interface Score {
  beats: Beat[];
  tickMs: number;
}

/** The per-frame drive the orb consumes from an active motion source. */
export interface MotionFrame {
  /** 0..1 amplitude target (the shared AmplitudeSource contract). */
  amplitude: number;
  /** 0..1 wobble-frequency target. */
  wobble: number;
  /** True only on the frame a ripple should fire. */
  ripple: boolean;
}

/**
 * The amplitude seam shared by every source (idle, score, future analyser):
 * a per-frame target on an identical 0..1 scale. The consumer owns smoothing
 * and the frame loop; the active source may change mid-utterance.
 */
export interface AmplitudeSource {
  sample(elapsedSeconds: number): number;
}

/** A source that also drives wobble and ripple, and knows when it is spent. */
export interface MotionSource extends AmplitudeSource {
  frame(elapsedSeconds: number): MotionFrame;
  readonly done: boolean;
}
