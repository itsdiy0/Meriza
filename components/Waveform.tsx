"use client";

import { useEffect, useRef } from "react";

interface WaveformProps {
  /** Reads the current 0..1 input level, or null when nothing is recording. */
  level: (() => number) | null;
}

const BARS = 14;
const MIN = 0.18;

/**
 * Bars that rise with the microphone level, so the composer shows it is
 * hearing you rather than only that it is open.
 *
 * Driven from its own frame loop writing transforms directly, rather than
 * through state. The level changes every frame and re-rendering the composer
 * sixty times a second to move five bars would be absurd.
 */
export default function Waveform({ level }: WaveformProps) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (level === null) return;

    let frame = 0;
    // Each bar trails the last slightly, so the group ripples rather than
    // pumping as one block.
    const scales = new Array<number>(BARS).fill(MIN);

    const tick = () => {
      const target = Math.max(MIN, level());

      for (let i = BARS - 1; i > 0; i--) {
        scales[i] += (scales[i - 1] - scales[i]) * 0.35;
      }
      scales[0] += (target - scales[0]) * 0.5;

      for (let i = 0; i < BARS; i++) {
        const bar = barsRef.current[i];
        if (bar) bar.style.transform = `scaleY(${scales[i].toFixed(3)})`;
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [level]);

  if (level === null) return null;

  return (
    <span aria-hidden className="flex h-4 shrink-0 items-center gap-[3px] px-2">
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          ref={(node) => {
            barsRef.current[i] = node;
          }}
          className="h-4 w-[2.5px] origin-center rounded-full bg-[var(--glow)]"
          style={{ transform: `scaleY(${MIN})` }}
        />
      ))}
    </span>
  );
}