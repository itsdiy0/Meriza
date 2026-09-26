"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { startRecording, type Recorder } from "@/lib/audio/record";
import { createVad, DEFAULT_VAD, type Vad } from "@/lib/audio/vad";
import { transcribe } from "@/lib/stt/transcribe";

interface TalkModeProps {
  open: boolean;
  onClose: () => void;
  onSend: (text: string) => void;
  /** Ends whatever Meriza is doing, so speaking interrupts her. */
  onInterrupt: () => void;
  /** Mirrors the microphone state to the orb. */
  onListening: (listening: boolean) => void;
}

type Phase = "idle" | "hearing" | "sending" | "denied";

/**
 * Standby listening. The microphone stays open and an utterance is sent when
 * the speaking stops, so there is no button and nothing to type into.
 *
 * Speaking interrupts whatever Meriza is saying, which works because the
 * browser's echo cancellation flattens her own voice into transients that
 * never hold long enough to clear the detector's onset. That was tested
 * rather than assumed, including with a speaker beside the microphone.
 *
 * The recorder runs continuously and is restarted per utterance rather than
 * buffered, which loses the onset window at the very start of each one. In
 * practice whisper recovers the first word from context, and the alternative
 * is holding a rolling buffer for a problem that has not appeared.
 */
export default function TalkMode({
  open,
  onClose,
  onSend,
  onInterrupt,
  onListening,
}: TalkModeProps) {
  const [phase, setPhase] = useState<Phase>("idle");

  const recorderRef = useRef<Recorder | null>(null);
  const vadRef = useRef<Vad | null>(null);
  // Held in a ref so the detector's callbacks, created once, always reach the
  // current handlers rather than the ones from the render that started it.
  const handlersRef = useRef({ onSend, onInterrupt });
  handlersRef.current = { onSend, onInterrupt };

  const teardown = useCallback(() => {
    vadRef.current?.stop();
    vadRef.current = null;
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setPhase("idle");
    onListening(false);
  }, [onListening]);

  useEffect(() => {
    if (!open) {
      teardown();
      return;
    }

    let live = true;

    const listen = async () => {
      let recorder: Recorder;
      try {
        recorder = await startRecording();
      } catch {
        if (live) setPhase("denied");
        return;
      }

      if (!live) {
        recorder.cancel();
        return;
      }

      recorderRef.current = recorder;
      onListening(true);

      vadRef.current = createVad(recorder.level, {
        onStart: () => {
          // Everything before the utterance is room noise, and carrying it
          // would put a long silence in front of every transcription.
          recorder.flush();
          setPhase("hearing");
          handlersRef.current.onInterrupt();
        },
        onEnd: () => {
          // The microphone stays open, so the next utterance can begin in the
          // same breath as this one ending.
          const audio = recorder.take();
          setPhase("sending");
          if (audio === null) return;

          void transcribe(audio)
            .then((text) => {
              if (text !== "" && live) handlersRef.current.onSend(text);
            })
            .catch((error) => {
              console.error("Could not transcribe:", error);
            })
            .finally(() => {
              if (live) setPhase("idle");
            });
        },
      });
    };

    void listen();

    return () => {
      live = false;
      teardown();
    };
  }, [open, onListening, teardown]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const label =
    phase === "denied"
      ? "Microphone access was denied"
      : phase === "hearing"
        ? "Listening"
        : phase === "sending"
          ? "One moment"
          : "Talk to Meriza";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex flex-col items-center gap-4 pb-[calc(env(safe-area-inset-bottom)+28px)]">
      {/* Says the microphone is open, which is the first thing Meriza does
          that keeps hearing you when you are not addressing her. */}
      <span
        className={`font-mono text-[10px] uppercase tracking-[0.18em] transition-colors ${
          phase === "denied"
            ? "text-[#FF8A5C]"
            : phase === "hearing"
              ? "text-[var(--glow)]"
              : "text-[var(--muted)]"
        }`}
      >
        {label}
      </span>

      <button
        type="button"
        onClick={onClose}
        aria-label="Leave talk mode"
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-[var(--line)] bg-[color-mix(in_srgb,var(--ink-2)_70%,transparent)] px-4 py-2 text-[13px] text-[var(--muted)] backdrop-blur-md transition-colors hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--glow)]"
      >
        <X size={13} weight="bold" />
        Leave
      </button>
    </div>
  );
}