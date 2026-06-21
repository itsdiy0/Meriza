import type { OrbState } from "@/lib/types";

/**
 * Per-state animation and palette presets. The orb eases between these every
 * frame, so changing `state` retargets the uniforms rather than snapping.
 *
 * - energy: drives point size, flicker, and the ambient halo intensity.
 * - breath / bSpeed: amplitude and speed of the global breathing sine.
 * - wAmp / wFreq / wSpeed: amplitude, spatial frequency, and speed of the noise wobble.
 * - rot: ambient auto-rotation per frame.
 * - colorA / colorB: duotone endpoints (hex ints for THREE.Color).
 * - glow: CSS hex used for the ambient halo behind the canvas.
 */
export interface OrbStatePreset {
  energy: number;
  breath: number;
  bSpeed: number;
  wAmp: number;
  wFreq: number;
  wSpeed: number;
  rot: number;
  colorA: number;
  colorB: number;
  glow: string;
}

export const ORB_STATES: Record<OrbState, OrbStatePreset> = {
  idle: {
    energy: 0.12,
    breath: 0.06,
    bSpeed: 1.0,
    wAmp: 0.05,
    wFreq: 1.6,
    wSpeed: 0.25,
    rot: 0.0016,
    colorA: 0x2bd6c6,
    colorB: 0x7c5cff,
    glow: "#2BD6C6",
  },
  listening: {
    energy: 0.42,
    breath: 0.1,
    bSpeed: 1.4,
    wAmp: 0.055,
    wFreq: 2.0,
    wSpeed: 0.55,
    rot: 0.0024,
    colorA: 0x3fe0d2,
    colorB: 0x5ef0e4,
    glow: "#5EF0E4",
  },
  thinking: {
    energy: 0.9,
    breath: 0.05,
    bSpeed: 1.2,
    wAmp: 0.14,
    wFreq: 3.4,
    wSpeed: 1.5,
    rot: 0.0062,
    colorA: 0x7c5cff,
    colorB: 0xb07cff,
    glow: "#B07CFF",
  },
  responding: {
    energy: 0.62,
    breath: 0.17,
    bSpeed: 3.2,
    wAmp: 0.07,
    wFreq: 2.2,
    wSpeed: 0.8,
    rot: 0.0032,
    colorA: 0xff9e5c,
    colorB: 0xff6fa5,
    glow: "#FF8A5C",
  },
};
