/** Identifies the active motion source. Used by the mixer during a crossfade. */
export type MotionSourceId = "waiting" | "score" | "analyser";

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
  /** 0..1 amplitude target (the shared amplitude contract). */
  amplitude: number;
  /** 0..1 wobble-frequency target. */
  wobble: number;
  /** True only on the frame a ripple should fire. */
  ripple: boolean;
}

/**
 * The seam shared by every motion source. A source reports a raw target for
 * the current instant and nothing else: it owns no frame loop, applies no
 * smoothing, and holds no timers. The orb drives it from its render loop and
 * lerps toward each result, so the active source can change mid-utterance.
 *
 * `frame` must be called at most once per source per rendered frame. `ripple`
 * is edge state and a second read in the same frame consumes it.
 */
export interface MotionSource {
  readonly id: MotionSourceId;
  /** True once the source has nothing left to play. */
  readonly done: boolean;
  frame(elapsedSeconds: number): MotionFrame;
}

