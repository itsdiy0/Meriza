import type {
    MotionFrame,
    MotionSource,
    MotionSourceId,
  } from "@/lib/orb/motion/types";
  
  const DEFAULT_FADE_SECONDS = 0.2;
  const REST: MotionFrame = { amplitude: 0, wobble: 0, ripple: false };
  
  const lerp = (a: number, b: number, n: number) => a + (b - a) * n;
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  const smoothstep = (n: number) => n * n * (3 - 2 * n);
  
  export interface MotionMixer {
    /** The source currently leading, or null when nothing is playing. */
    readonly activeId: MotionSourceId | null;
    /** Hands over to `next`, crossfading from whatever is already playing. */
    play(next: MotionSource, fadeSeconds?: number): void;
    /** Drops every source at once. The orb falls back to its state preset. */
    clear(): void;
    /**
     * The blended drive for this frame, or null when nothing is playing.
     *
     * Call at most once per rendered frame: each held source is pulled once per
     * call, and `ripple` is edge state that a second call would consume.
     */
    frame(elapsedSeconds: number): MotionFrame | null;
  }
  
  /**
   * Holds the active motion source and crossfades to its replacement, so a
   * handover mid-utterance reads as a slide rather than a cut. Amplitude and
   * wobble blend across the fade; ripple does not, and always comes from the
   * incoming source so the outgoing one cannot fire on its way out.
   *
   * Time comes from the orb's clock, which pauses with the tab, so a fade that
   * starts before a hidden tab resumes where it left off.
   */
  export function createMotionMixer(): MotionMixer {
    let lead: MotionSource | null = null;
    let trail: MotionSource | null = null;
    let fadeSeconds = DEFAULT_FADE_SECONDS;
    let fadeStart: number | null = null;
  
    const endFade = () => {
      trail = null;
      fadeStart = null;
    };
  
    return {
      get activeId() {
        return lead?.id ?? null;
      },
  
      play(next: MotionSource, seconds = DEFAULT_FADE_SECONDS) {
        // Playing during an existing fade drops the oldest source rather than
        // stacking a third: the current lead becomes the one fading out.
        trail = lead !== null && !lead.done ? lead : null;
        lead = next;
        fadeSeconds = Math.max(0, seconds);
        fadeStart = null;
      },
  
      clear() {
        lead = null;
        endFade();
      },
  
      frame(elapsedSeconds: number): MotionFrame | null {
        if (lead === null) return null;
  
        const front = lead.frame(elapsedSeconds);
  
        if (lead.done) {
          lead = null;
          endFade();
          return null;
        }
  
        if (trail === null) return front;
  
        if (fadeStart === null) fadeStart = elapsedSeconds;
        const progress =
          fadeSeconds > 0 ? (elapsedSeconds - fadeStart) / fadeSeconds : 1;
  
        if (progress >= 1) {
          endFade();
          return front;
        }
  
        // A spent trail rests rather than being pulled again, so the blend eases
        // toward zero instead of holding its final beat.
        const back = trail.done ? REST : trail.frame(elapsedSeconds);
        const weight = smoothstep(clamp01(progress));
  
        return {
          amplitude: lerp(back.amplitude, front.amplitude, weight),
          wobble: lerp(back.wobble, front.wobble, weight),
          ripple: front.ripple,
        };
      },
    };
  }