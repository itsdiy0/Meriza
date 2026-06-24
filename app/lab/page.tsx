"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Orb from "@/components/Orb";
import { createScoreSource } from "@/lib/orb/motion/player";
import { textToScore } from "@/lib/orb/motion/score";
import type { MotionFrame, MotionSource } from "@/lib/orb/motion/types";
import type { OrbState } from "@/lib/types";

const SAMPLE =
  "Meriza reads this aloud in motion, not sound. Watch the orb breathe with each word.";

export default function MotionLab() {
  const [text, setText] = useState(SAMPLE);
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [playing, setPlaying] = useState(false);

  const sourceRef = useRef<MotionSource | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onFrame = useCallback(
    (t: number): MotionFrame | null => sourceRef.current?.frame(t) ?? null,
    [],
  );

  const stop = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    sourceRef.current = null;
    setPlaying(false);
    setOrbState("idle");
  }, []);

  const speak = useCallback(() => {
    const score = textToScore(text);
    if (score.beats.length === 0) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    sourceRef.current = createScoreSource(score);
    setPlaying(true);
    setOrbState("responding");
    const durationMs = score.beats.length * score.tickMs + 600;
    timeoutRef.current = setTimeout(stop, durationMs);
  }, [text, stop]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden">
      <Orb state={orbState} onFrame={onFrame} />

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-end">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
            motion score lab
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Paste any text and watch the orb read it"
            aria-label="Text to perform"
            className="pointer-events-auto w-full resize-none rounded-2xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--ink-2)_70%,transparent)] p-3 text-[15px] text-[var(--text)] placeholder:text-[var(--muted)] backdrop-blur-md focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--glow)]"
          />
          <div className="pointer-events-auto flex gap-2">
            <button
              type="button"
              onClick={speak}
              disabled={text.trim() === ""}
              className="rounded-full bg-[var(--text)] px-5 py-2 text-sm text-[var(--ink)] transition-opacity disabled:opacity-30"
            >
              Speak
            </button>
            <button
              type="button"
              onClick={stop}
              disabled={!playing}
              className="rounded-full border border-[var(--line)] px-5 py-2 text-sm text-[var(--text)] transition-opacity disabled:opacity-30"
            >
              Stop
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
