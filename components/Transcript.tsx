"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent,
  type WheelEvent,
} from "react";
import { Sparkle } from "@phosphor-icons/react";
import RevealedText from "@/components/RevealedText";
import type { Message } from "@/lib/types";

interface TranscriptProps {
  messages: Message[];
  error: string | null;
}

const FADE =
  "linear-gradient(to bottom, transparent 0%, black 8%, black 88%, transparent 100%)";
const EXIT_MS = 420;
const REVEAL_OFFSET = 260;

/** Index of the message opening the current exchange, the latest user turn. */
function exchangeStart(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return i;
  }
  return 0;
}

export default function Transcript({ messages, error }: TranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  // Kept mounted past their removal so they can fade rather than vanish.
  const [leaving, setLeaving] = useState<Message[]>([]);

  const cut = exchangeStart(messages);
  const history = messages.slice(0, cut);
  const current = messages.slice(cut);
  const anchorId = current[0]?.id ?? null;

  const anchorRef = useRef<string | null>(anchorId);
  const shownRef = useRef<Message[]>(current);

  // A new exchange collapses whatever was open. Anything that was on screen
  // and is not part of the new turn leaves, and holds long enough to fade.
  useEffect(() => {
    if (anchorRef.current === anchorId) return;
    anchorRef.current = anchorId;

    const ids = new Set(current.map((m) => m.id));
    const gone = shownRef.current.filter((m) => !ids.has(m.id));

    setExpanded(false);
    if (gone.length === 0) return;

    setLeaving(gone);
    const timer = setTimeout(() => setLeaving([]), EXIT_MS);
    return () => clearTimeout(timer);
  }, [anchorId, current]);

  useEffect(() => {
    shownRef.current = expanded ? messages : current;
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, error]);

  /**
   * Opens the history without moving the current exchange, then eases up far
   * enough that the reveal is visible rather than only becoming scrollable.
   */
  const expand = useCallback(() => {
    if (expanded || history.length === 0) return;
    setExpanded(true);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
      el.scrollBy({
        top: -REVEAL_OFFSET,
        behavior: reduced ? "auto" : "smooth",
      });
    });
  }, [expanded, history.length]);

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (e.deltaY < 0 && e.currentTarget.scrollTop <= 0) expand();
  };

  const touchY = useRef(0);
  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    touchY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    const dragged = e.touches[0].clientY - touchY.current;
    if (dragged > 24 && e.currentTarget.scrollTop <= 0) expand();
  };

  if (messages.length === 0 && !error) return null;

  const shown = expanded ? messages : [...leaving, ...current];
  const hidden = history.length;

  return (
    <div
      ref={scrollRef}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      className="pointer-events-auto mx-auto h-full w-full max-w-xl overflow-y-auto px-5"
      style={{ maskImage: FADE, WebkitMaskImage: FADE }}
    >
      {/* Conversation opens below the orb's upper curve rather than against
          the composer. The affordance sits in the space above it. */}
      <div className="h-[10%]" />
      <div className="flex h-[25%] justify-center">
        {!expanded && hidden > 0 && (
          <button
            type="button"
            onClick={expand}
            aria-label={`Show ${hidden} earlier message${hidden === 1 ? "" : "s"}`}
            className="animate-message-in h-fit p-1.5 text-[var(--muted)] transition-colors hover:text-[var(--glow)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--glow)]"
          >
            <Sparkle size={18} weight="fill" className="animate-twinkle" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-5 pb-6">
        {shown.map((m) => {
          const going = !expanded && leaving.some((l) => l.id === m.id);
          return (
            <div
              key={m.id}
              aria-hidden={going}
              className={`${
                m.role === "user" ? "self-end text-right" : "self-start"
              } ${going ? "animate-exchange-out" : "animate-message-in"}`}
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
                {m.role === "user" ? "you" : "meriza"}
              </div>
              <p className="mt-1 max-w-md whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--text)]">
                {m.role === "assistant" ? (
                  <RevealedText text={m.content} />
                ) : (
                  m.content
                )}
                {m.role === "assistant" && m.content === "" && (
                  <span className="inline-block h-3 w-2 animate-pulse bg-[var(--text)] align-middle" />
                )}
              </p>
            </div>
          );
        })}

        {error && (
          <p className="self-start font-mono text-xs text-[#FF8A5C]">{error}</p>
        )}
      </div>
    </div>
  );
}