import type { OrbState } from "@/lib/types";

export type View = "overlay" | "left" | "right";
export type PaletteMode = "shift" | "custom";

/** Explicit duotone endpoints for one state. */
export interface StatePalette {
  a: string;
  b: string;
}

/**
 * Everything the person can tune about Meriza. Defined whole rather than grown
 * field by field, because the shape is what a stored blob has to be migrated
 * against, and knowing it early is worth more than the alternative.
 */
export interface Settings {
  /** Where the conversation sits relative to the orb. */
  view: View;
  /** Engine voice identifier. Not portable across engines. */
  voice: string | null;
  /** Speech rate the engine applies, 0.5 to 2. */
  speed: number;
  /** Which palette the orb uses. The two do not interact: switching away
   *  keeps the other intact, so neither is lost to a misclick. */
  paletteMode: PaletteMode;
  hueShift: number;
  saturation: number;
  lightness: number;
  /** Used only in custom mode. Seeded from the shift palette on first entry
   *  rather than left empty, since ten blank pickers is not a starting point
   *  anyone finishes. */
  palette: Partial<Record<OrbState, StatePalette>>;
}

export const DEFAULT_SETTINGS: Settings = {
  view: "overlay",
  voice: null,
  speed: 1,
  paletteMode: "shift",
  hueShift: 0,
  saturation: 1,
  lightness: 0,
  palette: {},
};