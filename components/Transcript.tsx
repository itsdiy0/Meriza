"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent,
  type WheelEvent,
} from "react";
import { Spiral } from "@phosphor-icons/react";
import RevealedText from "@/components/RevealedText";
import type { Message } from "@/lib/types";

interface TranscriptProps {
  messages: Message[];
  error: string | null;
  /** Id of the reply still being spoken, if any. */
  revealing: string | null;
  revealedWords: number;
  /** True when the transcript has its own column rather than sitting over the
   *  orb. Messages align to one edge instead of pulling apart. */
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

export default function Transcript({
  messages,
  error,
  revealing,
  revealedWords,
}: TranscriptProps) {
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

  // Follows the bottom only once content overflows. While the exchange fits,
  // this resolves to zero and the spacer holds it a quarter down the page.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, error, expanded]);

  const collapse = useCallback(() => {
    setExpanded(false);
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
  }, []);

  /**
   * Opens the history without moving the current exchange, then eases up far
   * enough that the reveal is visible rather than only becoming scrollable.
   */
  const expand = useCallback(() => {
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
  }, []);

  const toggle = useCallback(() => {
    if (expanded) collapse();
    else expand();
  }, [expanded, expand, collapse]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") collapse();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, collapse]);

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (expanded || history.length === 0) return;
    if (e.deltaY < 0 && e.currentTarget.scrollTop <= 0) expand();
  };

  const touchY = useRef(0);
  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    touchY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (expanded || history.length === 0) return;
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
      className="scrollbar-quiet pointer-events-auto mx-auto h-full w-full max-w-xl overflow-y-auto px-5"
      style={{ maskImage: FADE, WebkitMaskImage: FADE }}
    >
      {/* Reserves the space that opens the conversation a quarter down the
          page, with the affordance sitting near the top of it. Viewport units
          rather than percentages, which would resolve against width. */}
      <div className="flex h-[25dvh] justify-center pt-[9dvh]">
        {hidden > 0 && (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={expanded}
            aria-label={
              expanded
                ? "Hide earlier messages"
                : `Show ${hidden} earlier message${hidden === 1 ? "" : "s"}`
            }
            className="animate-message-in h-fit p-1.5 text-[var(--muted)] transition-colors hover:text-[var(--glow)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--glow)]"
          >
            <Spiral
              size={20}
              weight="bold"
              className={`transition-transform duration-500 ${
                expanded
                  ? "rotate-180 text-[var(--glow)]"
                  : "animate-twinkle rotate-0"
              }`}
            />
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
              <div className="mt-1 max-w-md text-[15px] leading-relaxed text-[var(--text)]">
                {m.role === "assistant" ? (
                  <RevealedText
                    text={m.content}
                    visibleWords={
                      m.id === revealing
                        ? revealedWords
                        : Number.MAX_SAFE_INTEGER
                    }
                  />
                ) : (
                  <span className="whitespace-pre-wrap">{m.content}</span>
                )}
                {m.role === "assistant" && m.content === "" && (
                  <span className="inline-block h-3 w-2 animate-pulse bg-[var(--text)] align-middle" />
                )}
              </div>
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