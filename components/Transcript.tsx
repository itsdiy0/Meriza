"use client";

import { useEffect, useRef } from "react";
import type { Message } from "@/lib/types";

interface TranscriptProps {
  messages: Message[];
  error: string | null;
}

const FADE =
  "linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)";

export default function Transcript({ messages, error }: TranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, error]);

  if (messages.length === 0 && !error) return null;

  return (
    <div
      ref={scrollRef}
      className="pointer-events-auto mx-auto h-full w-full max-w-xl overflow-y-auto px-5 py-6"
      style={{ maskImage: FADE, WebkitMaskImage: FADE }}
    >
      <div className="flex min-h-full flex-col justify-end gap-5">
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === "user" ? "self-end text-right" : "self-start"
            }
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
              {m.role === "user" ? "you" : "meriza"}
            </div>
            <p className="mt-1 max-w-md whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--text)]">
              {m.content}
              {m.role === "assistant" && m.content === "" && (
                <span className="inline-block h-3 w-2 animate-pulse bg-[var(--text)] align-middle" />
              )}
            </p>
          </div>
        ))}
        {error && (
          <p className="self-start font-mono text-xs text-[#FF8A5C]">{error}</p>
        )}
      </div>
    </div>
  );
}
