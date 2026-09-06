"use client";

import { useState, type FormEvent } from "react";
import { Gear, Microphone, PaperPlaneRight, Stop } from "@phosphor-icons/react";

interface ComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  onSettings: () => void;
  /** True while Meriza is generating or speaking. */
  active: boolean;
}

export default function Composer({
  onSend,
  onStop,
  onSettings,
  active,
}: ComposerProps) {
  const [value, setValue] = useState("");
  const empty = value.trim() === "";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (empty) return;
    onSend(value.trim());
    setValue("");
  };

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
        disabled
        aria-label="Voice input (coming in a later phase)"
        title="Voice input arrives later"
        className="grid size-9 shrink-0 cursor-not-allowed place-items-center rounded-full text-[var(--muted)] opacity-50"
      >
        <Microphone size={16} weight="light" />
      </button>

      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Say something to Meriza"
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
          disabled={empty}
          aria-label="Send message"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--text)] text-[var(--ink)] transition-opacity disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--glow)]"
        >
          <PaperPlaneRight size={16} weight="regular" />
        </button>
      )}
    </form>
  );
}