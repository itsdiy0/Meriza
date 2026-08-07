const TERMINATORS = new Set([".", "!", "?", "…"]);
const CLOSERS = new Set(['"', "'", "\u201d", "\u2019", ")", "]"]);
const SOFT_BREAKS = new Set([",", ";", ":"]);

const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "rev", "st", "jr", "sr",
  "vs", "etc", "eg", "ie", "approx", "inc", "ltd", "co", "no", "fig",
]);

/** What kind of break a chunk ends on. Drives the pause the player leaves. */
export type ChunkBoundary =
  | "sentence"
  | "line"
  | "paragraph"
  | "forced"
  | "flush";

interface Boundary {
  at: number;
  kind: "sentence" | "line" | "paragraph";
}

export interface ChunkLimits {
  /** Floor for packing sentences. Each request carries fixed overhead, so
   *  tiny chunks cost more time than the audio they return. */
  minChars: number;
  /** Lower floor for structural breaks, since a list item is worth its own
   *  clip even when it is short. */
  structuralMinChars: number;
  /** Preferred ceiling. Whole sentences are packed up to it. */
  softMax: number;
  /** Absolute ceiling. A longer sentence is divided at punctuation. */
  hardMax: number;
  /** Release whatever remains, for when no more text is coming. */
  flush: boolean;
}

export interface ChunkResult {
  chunk: string;
  rest: string;
  boundary: ChunkBoundary;
}

/** True when the period closes a title, an initial, or a common abbreviation. */
function isAbbreviation(text: string, at: number): boolean {
  let k = at - 1;
  while (k >= 0 && /[A-Za-z]/.test(text[k])) k--;
  const word = text.slice(k + 1, at).toLowerCase();
  if (word === "") return false;
  return word.length === 1 || ABBREVIATIONS.has(word);
}

/**
 * True when the period closes an ordered list marker: digits at the start of a
 * line. Bounded to the line start so a year ending a sentence still counts as
 * a sentence end.
 */
function isListMarker(text: string, at: number): boolean {
  let k = at - 1;
  while (k >= 0 && /\d/.test(text[k])) k--;
  if (k === at - 1) return false;
  while (k >= 0 && (text[k] === " " || text[k] === "\t")) k--;
  return k < 0 || text[k] === "\n";
}

/**
 * Offsets just past each break, tagged with its kind. A terminator only closes
 * a sentence once whitespace follows, so a period still being typed does not
 * split a chunk early, and neither an abbreviation nor a list number ever
 * closes one. A line break also closes one, since headings and list items
 * carry no terminator of their own, and a blank line between them reads as a
 * larger division.
 */
function boundaries(text: string): Boundary[] {
  const out: Boundary[] = [];

  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      let j = i + 1;
      let newlines = 1;
      while (j < text.length && /\s/.test(text[j])) {
        if (text[j] === "\n") newlines++;
        j++;
      }
      if (j < text.length) {
        out.push({ at: i + 1, kind: newlines > 1 ? "paragraph" : "line" });
        i = j - 1;
      }
      continue;
    }

    if (!TERMINATORS.has(text[i])) continue;
    if (text[i] === "." && isAbbreviation(text, i)) continue;
    if (text[i] === "." && isListMarker(text, i)) continue;

    let j = i + 1;
    while (j < text.length && TERMINATORS.has(text[j])) j++;
    while (j < text.length && CLOSERS.has(text[j])) j++;
    if (j < text.length && /\s/.test(text[j])) {
      out.push({ at: j, kind: "sentence" });
      i = j;
    }
  }

  return out;
}

/** Last comma-class break before `limit`, else the last space, else `limit`. */
function forcedBreak(text: string, min: number, limit: number): number {
  const cap = Math.min(limit, text.length);
  const floor = Math.min(min, cap);
  for (let i = cap - 1; i >= floor; i--) {
    if (SOFT_BREAKS.has(text[i])) return i + 1;
  }
  for (let i = cap - 1; i >= floor; i--) {
    if (/\s/.test(text[i])) return i;
  }
  return cap;
}

function split(
  buffer: string,
  at: number,
  boundary: ChunkBoundary,
): ChunkResult {
  return {
    chunk: buffer.slice(0, at).trim(),
    rest: buffer.slice(at),
    boundary,
  };
}

/**
 * Takes one synthesizable chunk off the front of `buffer`, or null when the
 * buffer holds nothing worth sending yet.
 *
 * A structural break ends the chunk on sight, ahead of any packing: silence
 * between list items or paragraphs can only be scheduled between clips, so
 * two items sharing one clip lose the division no matter how they are
 * punctuated. Sentences inside a block still pack up to `softMax`, which is
 * what keeps continuous prose from being chopped into one clip per sentence.
 *
 * A sentence too long for `hardMax` is divided into even pieces rather than
 * shaved from the front, which would leave a tail too short to be worth its
 * own request.
 */
export function takeChunk(
  buffer: string,
  limits: ChunkLimits,
): ChunkResult | null {
  if (buffer.trim() === "") return null;

  const { minChars, structuralMinChars, softMax, hardMax, flush } = limits;
  const bounds = boundaries(buffer);

  const structural = bounds.find(
    (b) =>
      b.kind !== "sentence" && b.at >= structuralMinChars && b.at <= hardMax,
  );
  if (structural !== undefined) {
    return split(buffer, structural.at, structural.kind);
  }

  let chosen: Boundary | null = null;
  for (const b of bounds) {
    if (b.at >= minChars && b.at <= softMax) chosen = b;
  }
  if (chosen === null) {
    chosen = bounds.find((b) => b.at >= minChars && b.at <= hardMax) ?? null;
  }
  if (chosen !== null) return split(buffer, chosen.at, chosen.kind);

  const end =
    bounds.find((b) => b.at >= minChars)?.at ?? (flush ? buffer.length : -1);

  if (end > hardMax) {
    const pieces = Math.ceil(end / hardMax);
    const target = Math.ceil(end / pieces);
    return split(buffer, forcedBreak(buffer, minChars, target), "forced");
  }

  if (buffer.length >= hardMax) {
    return split(buffer, forcedBreak(buffer, minChars, hardMax), "forced");
  }

  return flush ? split(buffer, buffer.length, "flush") : null;
}