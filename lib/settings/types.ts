export type View = "overlay" | "left" | "right";

/**
 * Everything the person can tune about Meriza. Defined whole rather than grown
 * field by field, because the shape is what a stored blob has to be migrated
 * against, and knowing it early is worth more than the alternative.
 *
 * Voice, speed, and palette are not wired yet. They live here so the storage
 * format does not change underneath them.
 */
export interface Settings {
  /** Where the conversation sits relative to the orb. `left` and `right` name
   *  the orb's side, so the conversation takes the other. */
  view: View;
  /** Engine voice identifier. Not portable across engines. */
  voice: string | null;
  /** Speech rate the engine applies, 0.5 to 2. */
  speed: number;
  /** Overrides the orb palette, keeping the per-state structure. */
  hueShift: number;

  /** Multiplies preset saturation, 0 greyscale to 2 vivid. */
  saturation: number;
  /** Shifts preset lightness, -0.2 dimmer to 0.2 brighter. */
  lightness: number;
}

export const DEFAULT_SETTINGS: Settings = {
  view: "overlay",
  voice: null,
  speed: 1,
  hueShift: 0,
  saturation: 1,
  lightness: 0,
};

