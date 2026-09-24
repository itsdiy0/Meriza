import * as THREE from "three";

const scratch = new THREE.Color();
const hsl = { h: 0, s: 0, l: 0 };

/**
 * Rotates a colour's hue, leaving saturation and lightness alone.
 *
 * Rotation rather than replacement is deliberate. The four state palettes are
 * tuned against each other, cool at rest and warm while speaking, and that
 * contrast is what makes a state change legible at a glance. Shifting all of
 * them by the same amount moves the whole scheme and keeps the relationships
 * intact, where per-state colours would destroy them.
 *
 * Returns a shared instance, so read the result before calling again.
 */
export function shiftHue(hex: number, degrees: number): THREE.Color {
  return scratch.setHex(hex).offsetHSL(degrees / 360, 0, 0);
}

/** The same rotation for a CSS hex string, for the halo behind the canvas. */
export function shiftHueCss(css: string, degrees: number): string {
  const color = new THREE.Color(css).offsetHSL(degrees / 360, 0, 0);
  return `#${color.getHexString()}`;
}

export interface PaletteShift {
  hue: number;
  saturation: number;
  lightness: number;
}

export const NO_SHIFT: PaletteShift = { hue: 0, saturation: 1, lightness: 0 };

/**
 * Adjusts a preset colour, preserving how the four states relate to each
 * other. Saturation multiplies rather than offsets, so a grey orb and a vivid
 * one both keep the cool-to-warm progression that makes a state legible.
 */
/** The same transform for a CSS hex string, for the halo and for previews. */
export function shiftColorCss(css: string, shift: PaletteShift): string {
  const color = new THREE.Color(css);
  color.getHSL(hsl);
  color.setHSL(
    (hsl.h + shift.hue / 360) % 1,
    Math.min(1, hsl.s * shift.saturation),
    Math.min(1, Math.max(0, hsl.l + shift.lightness)),
  );
  return `#${color.getHexString()}`;
}

/**
 * Adjusts a preset colour, preserving how the four states relate to each
 * other. Saturation multiplies rather than offsets, so a grey orb and a vivid
 * one both keep the cool-to-warm progression that makes a state legible.
 *
 * Returns a shared instance, so read the result before calling again.
 */
export function shiftColor(hex: number, shift: PaletteShift): THREE.Color {
  scratch.setHex(hex).getHSL(hsl);
  return scratch.setHSL(
    (hsl.h + shift.hue / 360) % 1,
    Math.min(1, hsl.s * shift.saturation),
    Math.min(1, Math.max(0, hsl.l + shift.lightness)),
  );
}

/**
 * Writes a state's colour into `target`: the custom one when supplied, the
 * transformed preset otherwise.
 *
 * Writes into a caller-owned instance rather than returning a shared one,
 * since the render loop needs two colours live at once.
 */
export function resolveInto(
  target: THREE.Color,
  hex: number,
  custom: string | undefined,
  shift: PaletteShift,
): THREE.Color {
  if (custom !== undefined) return target.set(custom);

  target.setHex(hex).getHSL(hsl);
  return target.setHSL(
    (hsl.h + shift.hue / 360) % 1,
    Math.min(1, hsl.s * shift.saturation),
    Math.min(1, Math.max(0, hsl.l + shift.lightness)),
  );
}