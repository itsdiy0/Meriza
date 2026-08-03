"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Orb from "@/components/Orb";
import { createSpeechPlayer, type SpeechPlayer } from "@/lib/audio/speech";
import { createMotionMixer, type MotionMixer } from "@/lib/orb/motion/mixer";
import { createScoreSource } from "@/lib/orb/motion/player";
import { textToScore } from "@/lib/orb/motion/score";
import type { OrbState } from "@/lib/types";

const SAMPLE =
  "Meriza reads this aloud in motion, not sound. Watch the orb breathe with each word.";

export default function MotionLab() {
  const [text, setText] = useState(SAMPLE);
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mixerRef = useRef<MotionMixer | null>(null);
  if (mixerRef.current === null) mixerRef.current = createMotionMixer();
  const mixer = mixerRef.current;

  const playerRef = useRef<SpeechPlayer | null>(null);
  if (playerRef.current === null) playerRef.current = createSpeechPlayer();
  const player = playerRef.current;

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onFrame = useCallback((t: number) => mixer.frame(t), [mixer]);

  const stop = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    player.stop();
    mixer.clear();
    setPlaying(false);
    setOrbState("idle");
  }, [mixer, player]);

  const startScore = useCallback(() => {
    const score = textToScore(text);
    if (score.beats.length === 0) return null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    mixer.play(createScoreSource(score));
    setPlaying(true);
    setError(null);
    setOrbState("responding");
    return score;
  }, [text, mixer]);

  const speak = useCallback(() => {
    const score = startScore();
    if (score === null) return;
    timeoutRef.current = setTimeout(
      stop,
      score.beats.length * score.tickMs + 600,
    );
  }, [startScore, stop]);

  const speakAloud = useCallback(async () => {
    if (startScore() === null) return;
    await player.unlock();
    try {
      const source = await player.speak(text, stop);
      if (source !== null) mixer.play(source);
    } catch {
      setError("Synthesis failed");
      stop();
    }
  }, [startScore, player, text, mixer, stop]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      player.dispose();
    };
  }, [player]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden">
      <Orb state={orbState} onFrame={onFrame} />

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-end">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
            {error ?? "motion score lab"}
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
              className="rounded-full border border-[var(--line)] px-5 py-2 text-sm text-[var(--text)] transition-opacity disabled:opacity-30"
            >
              Score only
            </button>
            <button
              type="button"
              onClick={speakAloud}
              disabled={text.trim() === ""}
              className="rounded-full bg-[var(--text)] px-5 py-2 text-sm text-[var(--ink)] transition-opacity disabled:opacity-30"
            >
              Speak aloud
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