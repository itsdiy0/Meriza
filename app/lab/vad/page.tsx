"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Microphone, Stop } from "@phosphor-icons/react";
import { startRecording, type Recorder } from "@/lib/audio/record";
import { createVad, DEFAULT_VAD, type Vad, type VadOptions } from "@/lib/audio/vad";

interface Utterance {
  at: number;
  durationMs: number;
}

const HISTORY = 240;

/**
 * Harness for tuning the detector. The parameters are guesses until someone
 * sits in the room they will run in and watches them be wrong, and the
 * hangover in particular cannot be reasoned to: it depends on how the person
 * using it pauses.
 */
export default function VadLab() {
  const [options, setOptions] = useState<VadOptions>(DEFAULT_VAD);
  const [running, setRunning] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [utterances, setUtterances] = useState<Utterance[]>([]);

  const recorderRef = useRef<Recorder | null>(null);
  const vadRef = useRef<Vad | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<{ level: number; speaking: boolean }[]>([]);

  const stop = useCallback(() => {
    vadRef.current?.stop();
    vadRef.current = null;
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setRunning(false);
    setSpeaking(false);
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current !== null) return;
    const recorder = await startRecording();
    recorderRef.current = recorder;

    vadRef.current = createVad(
      recorder.level,
      {
        onStart: () => setSpeaking(true),
        onEnd: (durationMs) => {
          setSpeaking(false);
          setUtterances((prev) => [{ at: Date.now(), durationMs }, ...prev].slice(0, 12));
        },
        onTick: (level, active) => {
          historyRef.current.push({ level, speaking: active });
          if (historyRef.current.length > HISTORY) historyRef.current.shift();
        },
      },
      // Read live, so moving a slider retunes without restarting.
      new Proxy({} as VadOptions, {
        get: (_, key) => optionsRef.current[key as keyof VadOptions],
      }),
    );

    setRunning(true);
  }, []);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    let frame = 0;
    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const line = height * (1 - optionsRef.current.threshold);
      ctx.strokeStyle = "rgba(255,138,92,0.6)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, line);
      ctx.lineTo(width, line);
      ctx.stroke();
      ctx.setLineDash([]);

      const step = width / HISTORY;
      historyRef.current.forEach((point, i) => {
        const h = Math.min(1, point.level) * height;
        ctx.fillStyle = point.speaking
          ? "rgba(94,240,228,0.9)"
          : "rgba(255,255,255,0.25)";
        ctx.fillRect(i * step, height - h, Math.max(1, step - 1), h);
      });

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  const field = (
    key: keyof VadOptions,
    label: string,
    min: number,
    max: number,
    step: number,
    unit: string,
  ) => (
    <label key={key} className="flex flex-col gap-2">
      <span className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
        <span className="tabular-nums">
          {options[key]}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={options[key]}
        onChange={(e) =>
          setOptions((prev) => ({ ...prev, [key]: Number(e.target.value) }))
        }
        className="accent-[var(--text)]"
      />
    </label>
  );

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
          voice activity lab
        </span>
        <button
          type="button"
          onClick={() => (running ? stop() : void start())}
          className="flex items-center gap-2 rounded-full border border-[var(--line)] px-4 py-2 text-[13px] text-[var(--text)] transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)]"
        >
          {running ? <Stop size={14} weight="fill" /> : <Microphone size={14} weight="light" />}
          {running ? "Stop" : "Listen"}
        </button>
      </div>

      <div
        className={`rounded-xl border p-1 transition-colors ${
          speaking ? "border-[var(--glow)]" : "border-[var(--line)]"
        }`}
      >
        <canvas ref={canvasRef} width={1200} height={200} className="h-40 w-full" />
      </div>

      <div className="flex flex-col gap-6">
        {field("threshold", "threshold", 0.01, 0.4, 0.005, "")}
        {field("onsetMs", "onset", 0, 500, 10, "ms")}
        {field("hangoverMs", "hangover", 200, 2500, 50, "ms")}
        {field("minSpeechMs", "minimum", 0, 1500, 50, "ms")}
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
          utterances
        </span>
        {utterances.length === 0 ? (
          <span className="text-[13px] text-[var(--muted)]">Nothing yet.</span>
        ) : (
          utterances.map((u) => (
            <span key={u.at} className="font-mono text-[12px] text-[var(--text)]">
              {(u.durationMs / 1000).toFixed(2)}s
            </span>
          ))
        )}
      </div>
    </main>
  );
}