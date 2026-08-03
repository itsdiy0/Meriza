import type { MotionFrame, MotionSource } from "@/lib/orb/motion/types";

const REST: MotionFrame = { amplitude: 0, wobble: 0, ripple: false };
const AMPLITUDE_GAIN = 3.5;
const WOBBLE_GAIN = 2.5;
const HIGH_BAND_START = 0.25;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export interface AnalyserSource extends MotionSource {
  /** Marks the source spent. Call when its audio has stopped. */
  end(): void;
}

/**
 * Reads a live 0..1 drive off a playing audio graph. Amplitude is the RMS of
 * the time-domain signal; wobble is the share of spectral energy in the upper
 * band, so sibilants and consonants tighten the orb the way the score's
 * per-word frequency does. Ripple never fires: the score marks sentence ends
 * from punctuation, which the waveform cannot recover.
 *
 * The node keeps producing silence after playback stops, so `done` is driven
 * externally by `end` rather than inferred from the signal.
 */
export function createAnalyserSource(analyser: AnalyserNode): AnalyserSource {
  const time = new Uint8Array(analyser.fftSize);
  const spectrum = new Uint8Array(analyser.frequencyBinCount);
  const split = Math.floor(spectrum.length * HIGH_BAND_START);
  let finished = false;

  return {
    id: "analyser",

    get done() {
      return finished;
    },

    end() {
      finished = true;
    },

    frame(): MotionFrame {
      if (finished) return REST;

      analyser.getByteTimeDomainData(time);
      let sum = 0;
      for (let i = 0; i < time.length; i++) {
        const v = (time[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / time.length);

      analyser.getByteFrequencyData(spectrum);
      let low = 0;
      let high = 0;
      for (let i = 0; i < spectrum.length; i++) {
        if (i < split) low += spectrum[i];
        else high += spectrum[i];
      }
      const total = low + high;

      return {
        amplitude: clamp01(rms * AMPLITUDE_GAIN),
        wobble: total > 0 ? clamp01((high / total) * WOBBLE_GAIN) : 0,
        ripple: false,
      };
    },
  };
}