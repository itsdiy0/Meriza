"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import type { SettingsHandle } from "@/lib/settings/useSettings";
import type { TTSVoice } from "@/lib/tts/provider";

interface SettingsProps extends SettingsHandle {
  open: boolean;
  onClose: () => void;
}

/** Kokoro encodes language and gender in the id, as `<language><gender>_name`. */
const LANGUAGES: Record<string, string> = {
  a: "American English",
  b: "British English",
  e: "Spanish",
  f: "French",
  h: "Hindi",
  i: "Italian",
  j: "Japanese",
  p: "Portuguese",
  z: "Mandarin",
};

const ORDER = ["a", "b", "e", "f", "h", "i", "j", "p", "z"];

interface Grouped {
  label: string;
  voices: { id: string; name: string; gender: string }[];
}

/**
 * Groups voices by the language their id encodes. An engine that names voices
 * differently falls through to one ungrouped list rather than an empty picker.
 */
function group(voices: TTSVoice[]): Grouped[] {
  const buckets = new Map<string, Grouped["voices"]>();
  const loose: Grouped["voices"] = [];

  for (const voice of voices) {
    const match = voice.id.match(/^([a-z])([fm])_(.+)$/);
    if (match === null || !(match[1] in LANGUAGES)) {
      loose.push({ id: voice.id, name: voice.name, gender: "" });
      continue;
    }
    const [, language, gender, name] = match;
    const entry = {
      id: voice.id,
      name: name.replace(/^v0/, "").replace(/^./, (c) => c.toUpperCase()),
      gender,
    };
    const bucket = buckets.get(language);
    if (bucket) bucket.push(entry);
    else buckets.set(language, [entry]);
  }

  const groups = ORDER.filter((key) => buckets.has(key)).map((key) => ({
    label: LANGUAGES[key],
    voices: buckets.get(key)!,
  }));

  return loose.length > 0
    ? [...groups, { label: "Other", voices: loose }]
    : groups;
}

export default function Settings({
  open,
  onClose,
  settings,
  set,
}: SettingsProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Fetched on open rather than on mount: the engine may not be running, and
  // a failed request should not cost anything until the picker is wanted.
  useEffect(() => {
    if (!open || voices.length > 0) return;
    let live = true;
    fetch("/api/tts/voices")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { voices: TTSVoice[] }) => {
        if (live) setVoices(data.voices);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [open, voices.length]);

  const grouped = useMemo(() => group(voices), [voices]);

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
        aria-label="Settings"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="animate-message-in relative w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--ink-2)_92%,transparent)] p-6 shadow-2xl focus:outline-none"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
            voice
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="text-[var(--muted)] transition-colors hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--glow)]"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="flex flex-col gap-6">
          <label className="flex flex-col gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
              speaker
            </span>
            {failed ? (
              <span className="text-[13px] text-[var(--muted)]">
                The speech engine is not reachable.
              </span>
            ) : (
              <select
                value={settings.voice ?? ""}
                onChange={(e) => set("voice", e.target.value || null)}
                className="rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-[14px] text-[var(--text)] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--glow)]"
              >
                <option value="">Engine default</option>
                {grouped.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                        {v.gender === "" ? "" : ` (${v.gender})`}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
          </label>

          <label className="flex flex-col gap-2">
            <span className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
              pace
              <span className="tabular-nums">{settings.speed.toFixed(2)}x</span>
            </span>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={settings.speed}
              onChange={(e) => set("speed", Number(e.target.value))}
              className="accent-[var(--text)]"
            />
          </label>
        </div>
      </div>
    </div>
  );
}