"use client";

import { useState, type FormEvent } from "react";

interface ComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  /** True while Meriza is generating or speaking. */
  active: boolean;
}

export default function Composer({ onSend, onStop, active }: ComposerProps) {
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
        disabled
        aria-label="Voice input (coming in a later phase)"
        title="Voice input arrives later"
        className="grid size-9 shrink-0 cursor-not-allowed place-items-center rounded-full text-[var(--muted)] opacity-50"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
          aria-hidden
        >
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <path d="M12 18v3" />
        </svg>
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
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="size-3.5"
            aria-hidden
          >
            <rect x="6" y="6" width="12" height="12" rx="2.5" />
          </svg>
        </button>
      ) : (
        <button
          type="submit"
          disabled={empty}
          aria-label="Send message"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--text)] text-[var(--ink)] transition-opacity disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--glow)]"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
            aria-hidden
          >
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>
        </button>
      )}
    </form>
  );
}