"use client";

import { useEffect, useRef } from "react";
import { X } from "@phosphor-icons/react";
import type { SettingsHandle } from "@/lib/settings/useSettings";

interface SettingsProps extends SettingsHandle {
  open: boolean;
  onClose: () => void;
}

interface RowProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

function Row({ label, hint, children }: RowProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </div>
      {children}
      {hint && <p className="text-[13px] text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

interface ChoiceProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

function Choice<T extends string>({ value, options, onChange }: ChoiceProps<T>) {
  return (
    <div
      role="radiogroup"
      className="flex gap-1 rounded-full border border-[var(--line)] p-1"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-full px-3 py-1.5 text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--glow)] ${
              active
                ? "bg-[var(--text)] text-[var(--ink)]"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The settings surface. Deliberately sparse: it holds what exists rather than
 * reserving space for what is planned, so it does not read as half-built.
 */
export default function Settings({
  open,
  onClose,
  settings,
  set,
}: SettingsProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
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
        aria-label="Settings"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="animate-message-in relative w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--ink-2)_92%,transparent)] p-6 shadow-2xl focus:outline-none"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
            settings
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
          <Row label="layout">
            <Choice
              value={settings.layout}
              onChange={(value) => set("layout", value)}
              options={[
                { value: "overlay", label: "Overlay" },
                { value: "split", label: "Split" },
              ]}
            />
          </Row>

          {settings.layout === "split" && (
            <Row label="orb side">
              <Choice
                value={settings.side}
                onChange={(value) => set("side", value)}
                options={[
                  { value: "left", label: "Left" },
                  { value: "right", label: "Right" },
                ]}
              />
            </Row>
          )}
        </div>
      </div>
    </div>
  );
}