"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Palette, SpeakerHigh, X } from "@phosphor-icons/react";
import { ORB_STATES } from "@/lib/orb/states";
import { shiftHueCss } from "@/lib/orb/palette";
import type { SettingsHandle } from "@/lib/settings/useSettings";
import type { TTSVoice } from "@/lib/tts/provider";
import type { OrbState } from "@/lib/types";

interface SettingsProps extends SettingsHandle {
  open: boolean;
  onClose: () => void;
}

type Tab = "voice" | "theme";

const TABS: { id: Tab; label: string; Icon: typeof Palette }[] = [
  { id: "voice", label: "Voice", Icon: SpeakerHigh },
  { id: "theme", label: "Theme", Icon: Palette },
];

const SWATCH_STATES: OrbState[] = [
  "idle",
  "thinking",
  "waiting",
  "responding",
];

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

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
        {value && <span className="tabular-nums">{value}</span>}
      </span>
      {children}
    </label>
  );
}

export default function Settings({
  open,
  onClose,
  settings,
  set,
}: SettingsProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("voice");
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

  const swatches = useMemo(
    () =>
      SWATCH_STATES.map((state) => ({
        state,
        a: shiftHueCss(
          `#${ORB_STATES[state].colorA.toString(16).padStart(6, "0")}`,
          settings.hueShift,
        ),
        b: shiftHueCss(
          `#${ORB_STATES[state].colorB.toString(16).padStart(6, "0")}`,
          settings.hueShift,
        ),
      })),
    [settings.hueShift],
  );

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
        className="animate-message-in relative flex w-full max-w-lg gap-6 rounded-2xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--ink-2)_92%,transparent)] p-6 shadow-2xl focus:outline-none"
      >
        <div
          role="tablist"
          aria-orientation="vertical"
          className="flex w-28 shrink-0 flex-col gap-1"
        >
          {TABS.map(({ id, label, Icon }) => {
            const active = id === tab;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--glow)] ${
                  active
                    ? "bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                <Icon size={15} weight={active ? "fill" : "light"} />
                {label}
              </button>
            );
          })}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-5 flex items-start justify-between">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
              {tab}
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

          {tab === "voice" ? (
            <div className="flex flex-col gap-6">
              <Field label="speaker">
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
              </Field>

              <Field label="pace" value={`${settings.speed.toFixed(2)}x`}>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={settings.speed}
                  onChange={(e) => set("speed", Number(e.target.value))}
                  className="accent-[var(--text)]"
                />
              </Field>

              <p className="text-[13px] text-[var(--muted)]">
                Changes apply from your next message, not the one being spoken.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <Field label="hue" value={`${settings.hueShift}\u00B0`}>
                <input
                  type="range"
                  min={0}
                  max={360}
                  step={1}
                  value={settings.hueShift}
                  onChange={(e) => set("hueShift", Number(e.target.value))}
                  className="accent-[var(--text)]"
                />
              </Field>

              {/* Each pair is one state, so the contrast between them is what
                  the slider preserves. The orb sits behind a blur while this
                  is open, which makes a legible preview worth having. */}
              <div className="flex gap-2" aria-hidden>
                {swatches.map(({ state, a, b }) => (
                  <div
                    key={state}
                    title={state}
                    className="h-8 flex-1 rounded-md"
                    style={{
                      background: `linear-gradient(135deg, ${a}, ${b})`,
                    }}
                  />
                ))}
              </div>

              <p className="text-[13px] text-[var(--muted)]">
                Rotates the whole palette. Idle, thinking, waiting and speaking
                keep their relative colours.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}