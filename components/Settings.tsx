"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, Palette, SpeakerHigh, X } from "@phosphor-icons/react";
import { shiftColorCss } from "@/lib/orb/palette";
import { ORB_STATES } from "@/lib/orb/states";
import { downloadBackup } from "@/lib/storage/backup";
import { clearAll } from "@/lib/storage/conversations";
import type { SettingsHandle } from "@/lib/settings/useSettings";
import type { TTSVoice } from "@/lib/tts/provider";
import type { OrbState } from "@/lib/types";

interface SettingsProps extends SettingsHandle {
  open: boolean;
  onClose: () => void;
  /** True while a reply is being spoken. */
  speaking?: boolean;
  /** Called after the store is emptied, so the app can start fresh. */
  onCleared: () => void;
}

type Tab = "voice" | "theme" | "data";

const TABS: { id: Tab; label: string; Icon: typeof Palette }[] = [
  { id: "voice", label: "Voice", Icon: SpeakerHigh },
  { id: "theme", label: "Theme", Icon: Palette },
  { id: "data", label: "Data", Icon: Archive },
];

const SWATCH_STATES: OrbState[] = ["idle", "thinking", "waiting", "responding"];

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

const hex = (value: number) => `#${value.toString(16).padStart(6, "0")}`;

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

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </span>
      {children}
      <p className="text-[13px] text-[var(--muted)]">{hint}</p>
    </div>
  );
}

interface VoicePanelProps {
  settings: SettingsHandle["settings"];
  set: SettingsHandle["set"];
  grouped: Grouped[];
  failed: boolean;
  speaking: boolean;
}

function VoicePanel({
  settings,
  set,
  grouped,
  failed,
  speaking,
}: VoicePanelProps) {
  return (
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
        {speaking
          ? "Meriza is speaking. Changes take effect from your next message."
          : "Changes apply from your next message, not the one being spoken."}
      </p>
    </div>
  );
}

interface ThemePanelProps {
  settings: SettingsHandle["settings"];
  set: SettingsHandle["set"];
}

function ThemePanel({ settings, set }: ThemePanelProps) {
  const { hueShift, saturation, lightness } = settings;

  const swatches = useMemo(() => {
    const shift = { hue: hueShift, saturation, lightness };
    return SWATCH_STATES.map((state) => ({
      state,
      a: shiftColorCss(hex(ORB_STATES[state].colorA), shift),
      b: shiftColorCss(hex(ORB_STATES[state].colorB), shift),
    }));
  }, [hueShift, saturation, lightness]);

  return (
    <div className="flex flex-col gap-6">
      <Field label="hue" value={`${hueShift}\u00B0`}>
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={hueShift}
          onChange={(e) => set("hueShift", Number(e.target.value))}
          className="accent-[var(--text)]"
        />
      </Field>

      <Field label="saturation" value={`${saturation.toFixed(2)}x`}>
        <input
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={saturation}
          onChange={(e) => set("saturation", Number(e.target.value))}
          className="accent-[var(--text)]"
        />
      </Field>

      <Field
        label="lightness"
        value={
          lightness === 0
            ? "0"
            : `${lightness > 0 ? "+" : ""}${lightness.toFixed(2)}`
        }
      >
        <input
          type="range"
          min={-0.2}
          max={0.2}
          step={0.01}
          value={lightness}
          onChange={(e) => set("lightness", Number(e.target.value))}
          className="accent-[var(--text)]"
        />
      </Field>

      {/* Each pair is one state, so the contrast between them is what the
          controls preserve. The orb sits behind a blur while this is open,
          which makes a legible preview worth having. */}
      <div className="flex gap-2" aria-hidden>
        {swatches.map(({ state, a, b }) => (
          <div
            key={state}
            title={state}
            className="h-8 flex-1 rounded-md"
            style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
          />
        ))}
      </div>

      <p className="text-[13px] text-[var(--muted)]">
        Adjusts the whole palette. Idle, thinking, waiting and speaking keep
        their relative colours.
      </p>
    </div>
  );
}

interface DataPanelProps {
  onCleared: () => void;
  onClose: () => void;
}

function DataPanel({ onCleared, onClose }: DataPanelProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <Section
        label="export"
        hint="Every conversation as JSON. This is the only copy that survives clearing your browser data or moving to another machine."
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void downloadBackup()
              .catch((error) => {
                console.error("Could not export:", error);
              })
              .finally(() => setBusy(false));
          }}
          className="self-start rounded-lg border border-[var(--line)] px-4 py-2 text-[14px] text-[var(--text)] transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--glow)]"
        >
          Download everything
        </button>
      </Section>

      <Section
        label="erase"
        hint="Deletes every conversation on this machine. Nothing is stored elsewhere, so this cannot be undone. Export first."
      >
        {confirming ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void clearAll()
                  .then(() => {
                    onCleared();
                    onClose();
                  })
                  .catch((error) => {
                    console.error("Could not erase:", error);
                  })
                  .finally(() => {
                    setBusy(false);
                    setConfirming(false);
                  });
              }}
              className="rounded-lg border border-[#FF8A5C] px-4 py-2 text-[14px] text-[#FF8A5C] transition-colors hover:bg-[color-mix(in_srgb,#FF8A5C_14%,transparent)] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--glow)]"
            >
              Erase everything
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-2 py-2 text-[14px] text-[var(--muted)] transition-colors hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--glow)]"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="self-start rounded-lg border border-[var(--line)] px-4 py-2 text-[14px] text-[var(--muted)] transition-colors hover:border-[#FF8A5C] hover:text-[#FF8A5C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--glow)]"
          >
            Erase all conversations
          </button>
        )}
      </Section>
    </div>
  );
}

export default function Settings({
  open,
  onClose,
  settings,
  set,
  speaking = false,
  onCleared,
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

          {/* Each panel is its own component, so a tab that owns local state
              gets it for free and the switch below stays a switch rather than
              three bodies inlined in one ternary. */}
          {tab === "voice" && (
            <VoicePanel
              settings={settings}
              set={set}
              grouped={grouped}
              failed={failed}
              speaking={speaking}
            />
          )}
          {tab === "theme" && <ThemePanel settings={settings} set={set} />}
          {tab === "data" && (
            <DataPanel onCleared={onCleared} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}