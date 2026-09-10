"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent,
  type UIEvent,
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
}

const EXIT_MS = 420;

/** Index of the message opening the current exchange, the latest user turn. */
function exchangeStart(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return i;
  }
  return 0;
}

interface BubbleProps {
  message: Message;
  revealing: string | null;
  revealedWords: number;
}

function Bubble({ message, revealing, revealedWords }: BubbleProps) {
  return (
    <>
      <div className="text-lift font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
        {message.role === "user" ? "you" : "meriza"}
      </div>
      <div className="text-lift mt-1 max-w-md text-[15px] leading-relaxed text-[var(--text)]">
        {message.role === "assistant" ? (
          <RevealedText
            text={message.content}
            visibleWords={
              message.id === revealing
                ? revealedWords
                : Number.MAX_SAFE_INTEGER
            }
          />
        ) : (
          <span className="whitespace-pre-wrap">{message.content}</span>
        )}
        {message.role === "assistant" && message.content === "" && (
          <span className="inline-block h-3 w-2 animate-pulse bg-[var(--text)] align-middle" />
        )}
      </div>
    </>
  );
}

export default function Transcript({
  messages,
  error,
  revealing,
  revealedWords,
}: TranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // Held past their removal so they can fade. Rendered out of flow, so a stuck
  // exit can never displace the exchange that replaced them.
  const [leaving, setLeaving] = useState<Message[]>([]);

  const cut = exchangeStart(messages);
  const history = messages.slice(0, cut);
  const current = messages.slice(cut);
  const anchorId = current[0]?.id ?? null;

  const anchorRef = useRef<string | null>(anchorId);
  const shownRef = useRef<Message[]>(current);
  const exitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whether the view still tracks the end of the reply. Cleared by scrolling
  // up, taken again by the next exchange.
  const pinnedRef = useRef(true);

  const rewind = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
    pinnedRef.current = true;
    setScrolled(false);
  }, []);

  // A new exchange collapses whatever was open and returns to the anchor.
  // Everything previously on screen is leaving by definition, since a new turn
  // makes all of it history. Depends on the anchor id alone: a derived array
  // here would change identity every render, and its cleanup would cancel the
  // exit timer before it could ever fire.
  useEffect(() => {
    if (anchorRef.current === anchorId) return;
    anchorRef.current = anchorId;

    const gone = shownRef.current;
    setExpanded(false);
    rewind();

    if (exitRef.current !== null) clearTimeout(exitRef.current);
    if (gone.length === 0) {
      setLeaving([]);
      return;
    }

    setLeaving(gone);
    exitRef.current = setTimeout(() => {
      exitRef.current = null;
      setLeaving([]);
    }, EXIT_MS);
  }, [anchorId, rewind]);

  useEffect(() => {
    return () => {
      if (exitRef.current !== null) clearTimeout(exitRef.current);
    };
  }, []);

  useEffect(() => {
    shownRef.current = expanded ? messages : current;
  });

  // Follows the reply as it grows, so a long one runs off the bottom rather
  // than off the screen. Scrolling up releases it, since reading back should
  // not be yanked, and the next exchange takes it again.
  useEffect(() => {
    if (expanded || !pinnedRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, revealedWords, expanded]);

  const collapse = useCallback(() => {
    setExpanded(false);
    rewind();
  }, [rewind]);

  /**
   * Opens the history above. The padding holds the current exchange at the
   * anchor, so scrolling to the end lands on it with the history overhead.
   */
  const expand = useCallback(() => {
    setExpanded(true);
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
      setScrolled(el.scrollTop > 4);
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

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setScrolled(el.scrollTop > 4);
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

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

  const shown = expanded ? messages : current;
  const hidden = history.length;

  // Softens both edges of the box. The top only fades once something has
  // scrolled past it, so the first line of a fresh exchange is never dimmed.
  const fade = scrolled
    ? "linear-gradient(to bottom, transparent 0%, black 7%, black 78%, transparent 96%)"
    : "linear-gradient(to bottom, black 0%, black 78%, transparent 96%)";

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Pinned to the viewport rather than carried by the scroll, so it stays
          reachable however far the history is scrolled. */}
      {hidden > 0 && (
        <div className="absolute inset-x-0 top-[9dvh] z-20 flex justify-center">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={expanded}
            aria-label={
              expanded
                ? "Hide earlier messages"
                : `Show ${hidden} earlier message${hidden === 1 ? "" : "s"}`
            }
            className="animate-message-in pointer-events-auto p-1.5 text-[var(--muted)] transition-colors hover:text-[var(--glow)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--glow)]"
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
        </div>
      )}

      {/* The outgoing exchange, over the top of the incoming one and outside
          its layout entirely. Static, so it needs no bottom padding. */}
      {!expanded && leaving.length > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-5 pt-[25dvh]">
            {leaving.map((m) => (
              <div
                key={m.id}
                className={`animate-exchange-out ${
                  m.role === "user" ? "self-end text-right" : "self-start"
                }`}
              >
                <Bubble
                  message={m}
                  revealing={null}
                  revealedWords={Number.MAX_SAFE_INTEGER}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The anchor is padding rather than a scroll position or an offset top
          edge, so nothing can clamp it or scroll it away: a fresh exchange
          always opens a quarter down the page and grows downward. The bottom
          padding matches the fade region, so scrolled to the end the last line
          sits clear of it rather than under the composer. */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        className="scrollbar-quiet pointer-events-auto absolute inset-0 overflow-y-auto"
        style={{ maskImage: fade, WebkitMaskImage: fade }}
      >
        <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-5 pb-[24dvh] pt-[25dvh]">
          {shown.map((m) => (
            <div
              key={m.id}
              className={`animate-message-in ${
                m.role === "user" ? "self-end text-right" : "self-start"
              }`}
            >
              <Bubble
                message={m}
                revealing={revealing}
                revealedWords={revealedWords}
              />
            </div>
          ))}

          {error && (
            <p className="text-lift self-start font-mono text-xs text-[#FF8A5C]">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}