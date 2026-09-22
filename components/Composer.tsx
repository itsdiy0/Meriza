"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { Gear, Microphone, PaperPlaneRight, Stop } from "@phosphor-icons/react";
import { startRecording, type Recorder } from "@/lib/audio/record";
import { transcribe } from "@/lib/stt/transcribe";
import Waveform from "@/components/Waveform";

interface ComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  onSettings: () => void;
  /** Fires when the microphone opens and closes, for the orb. */
  onListening: (listening: boolean) => void;
  /** True while Meriza is generating or speaking. */
  active: boolean;
  disabled?: boolean;
}

export default function Composer({
  onSend,
  onStop,
  onSettings,
  onListening,
  active,
  disabled = false,
}: ComposerProps) {
  const [value, setValue] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [denied, setDenied] = useState(false);
  const [level, setLevel] = useState<(() => number) | null>(null);

  const recorderRef = useRef<Recorder | null>(null);

  const empty = value.trim() === "";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (empty) return;
    onSend(value.trim());
    setValue("");
  };

  const beginRecording = useCallback(async () => {
    if (recorderRef.current !== null || disabled) return;

    // Speaking interrupts, since you are plainly addressing her rather than
    // listening. This is barge-in, solved by a button.
    onStop();

    try {
      const recorder = await startRecording();
      recorderRef.current = recorder;
      setDenied(false);
      setRecording(true);
      // Wrapped, since useState treats a bare function as a lazy initialiser
      // and would call it rather than store it.
      setLevel(() => recorder.level);
      onListening(true);
    } catch {
      setDenied(true);
    }
  }, [disabled, onListening, onStop]);

  const endRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (recorder === null) return;
    recorderRef.current = null;

    setRecording(false);
    setLevel(null);
    onListening(false);

    const audio = await recorder.stop();
    if (audio === null) return;

    setTranscribing(true);
    try {
      const text = await transcribe(audio);
      // Silence and noise come back empty, and sending nothing is worse than
      // doing nothing.
      if (text !== "") onSend(text);
    } catch (error) {
      console.error("Could not transcribe:", error);
    } finally {
      setTranscribing(false);
    }
  }, [onListening, onSend]);

  const onMicClick = () => {
    if (recorderRef.current !== null) {
      void endRecording();
      return;
    }
    void beginRecording();
  };

  const micLabel = denied
    ? "Microphone access was denied"
    : recording
      ? "Stop and send"
      : "Speak";

  return (
    <form
      onSubmit={submit}
      className="pointer-events-auto mx-auto flex w-full max-w-xl items-center gap-1 rounded-full border border-[var(--line)] bg-[color-mix(in_srgb,var(--ink-2)_70%,transparent)] p-1.5 backdrop-blur-md"
    >
      <button
        type="button"
        onClick={onSettings}
        aria-label="Settings"
        className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--muted)] transition-colors hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--glow)]"
      >
        <Gear size={16} weight="light" />
      </button>

      <button
        type="button"
        disabled={disabled || transcribing}
        onClick={onMicClick}
        aria-label={micLabel}
        title={micLabel}
        className={`grid size-9 shrink-0 place-items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--glow)] ${
          recording
            ? "bg-[var(--glow)] text-[var(--ink)]"
            : denied
              ? "text-[#FF8A5C]"
              : "text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40"
        }`}
      >
        {recording ? (
          <Stop size={14} weight="fill" />
        ) : (
          <Microphone
            size={16}
            weight="light"
            className={transcribing ? "animate-pulse" : undefined}
          />
        )}
      </button>

      <Waveform level={level} />

      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled || recording}
        placeholder={
          recording
            ? "Listening"
            : transcribing
              ? "..."
              : "Say something to Meriza"
        }
        aria-label="Message Meriza"
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent px-2 text-[15px] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none"
      />

      {active ? (
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--text)] text-[var(--ink)] transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--glow)]"
        >
          <Stop size={14} weight="fill" />
        </button>
      ) : (
        <button
          type="submit"
          disabled={empty || disabled}
          aria-label="Send message"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--text)] text-[var(--ink)] transition-opacity disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--glow)]"
        >
          <PaperPlaneRight size={16} weight="regular" />
        </button>
      )}
    </form>
  );
}