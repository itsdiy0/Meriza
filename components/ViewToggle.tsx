"use client";

import { SquareHalf, Stack } from "@phosphor-icons/react";
import type { View } from "@/lib/settings/types";

interface ViewToggleProps {
  value: View;
  onChange: (view: View) => void;
}

const OPTIONS: { value: View; label: string; mirrored: boolean }[] = [
  { value: "overlay", label: "Overlay", mirrored: false },
  { value: "left", label: "Orb on the left", mirrored: false },
  { value: "right", label: "Orb on the right", mirrored: true },
];

/**
 * Segmented control for the arrangement of the orb and the conversation. Sits
 * as persistent chrome rather than inside settings, because it is switched
 * often enough that a modal round trip would be tedious.
 *
 * Rests at low opacity so it does not compete with the orb, and comes up on
 * hover or focus.
 */
export default function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Layout"
      className="pointer-events-auto flex gap-0.5 rounded-full border border-[var(--line)] bg-[color-mix(in_srgb,var(--ink-2)_60%,transparent)] p-1 opacity-40 backdrop-blur-md transition-opacity duration-300 hover:opacity-100 focus-within:opacity-100"
    >
      {OPTIONS.map((option) => {
        const active = option.value === value;
        const Icon = option.value === "overlay" ? Stack : SquareHalf;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => onChange(option.value)}
            className={`grid size-7 place-items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--glow)] ${
              active
                ? "bg-[var(--text)] text-[var(--ink)]"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            <Icon
              size={14}
              weight={active ? "fill" : "regular"}
              mirrored={option.mirrored}
            />
          </button>
        );
      })}
    </div>
  );
}