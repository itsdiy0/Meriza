"use client";

import { useEffect, useRef, useState } from "react";
import { ChatCircle, Plus, Trash } from "@phosphor-icons/react";
import type { Conversation } from "@/lib/storage/types";

interface ConversationsProps {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  currentId: string | null;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000000],
  ["month", 2592000000],
  ["week", 604800000],
  ["day", 86400000],
  ["hour", 3600000],
  ["minute", 60000],
];

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function when(timestamp: number): string {
  const elapsed = timestamp - Date.now();
  for (const [unit, size] of UNITS) {
    if (Math.abs(elapsed) >= size) {
      return relative.format(Math.round(elapsed / size), unit);
    }
  }
  return "just now";
}

/**
 * The conversation switcher. An overlay rather than a sidebar, because
 * conversations are changed occasionally and permanent chrome would compete
 * with the orb for the whole session to serve a moment.
 */
export default function Conversations({
  open,
  onClose,
  conversations,
  currentId,
  onOpen,
  onCreate,
  onDelete,
}: ConversationsProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Deleting is irreversible and there is no server copy, so the row asks
  // before it goes.
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfirming(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center p-5"
      onClick={onClose}
    >
      <div
        aria-hidden
        className="animate-message-in absolute inset-0 bg-[color-mix(in_srgb,var(--ink)_70%,transparent)] backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Conversations"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="animate-message-in relative flex max-h-[70dvh] w-full max-w-sm flex-col rounded-2xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--ink-2)_92%,transparent)] p-4 shadow-2xl focus:outline-none"
      >
        <button
          type="button"
          onClick={() => {
            onCreate();
            onClose();
          }}
          className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[14px] text-[var(--text)] transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--glow)]"
        >
          <Plus size={15} weight="bold" />
          New conversation
        </button>

        <div className="scrollbar-quiet -mr-1 flex flex-col gap-0.5 overflow-y-auto pr-1">
          {conversations.map((conversation) => {
            const current = conversation.id === currentId;
            const asking = confirming === conversation.id;
            return (
              <div
                key={conversation.id}
                className={`group flex items-center gap-2 rounded-lg pr-1 transition-colors ${
                  current
                    ? "bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                    : "hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onOpen(conversation.id);
                    onClose();
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--glow)]"
                >
                  <ChatCircle
                    size={15}
                    weight={current ? "fill" : "light"}
                    className={
                      current ? "text-[var(--glow)]" : "text-[var(--muted)]"
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-[var(--text)]">
                      {conversation.title ?? "New conversation"}
                    </span>
                    <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                      {when(conversation.updatedAt)}
                    </span>
                  </span>
                </button>

                {asking ? (
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(conversation.id);
                      setConfirming(null);
                    }}
                    className="shrink-0 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#FF8A5C] transition-colors hover:bg-[color-mix(in_srgb,#FF8A5C_14%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--glow)]"
                  >
                    Sure?
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(conversation.id)}
                    aria-label={`Delete ${conversation.title ?? "this conversation"}`}
                    className="shrink-0 p-1.5 text-[var(--muted)] opacity-0 transition-opacity hover:text-[#FF8A5C] focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--glow)] group-hover:opacity-100"
                  >
                    <Trash size={14} weight="light" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}