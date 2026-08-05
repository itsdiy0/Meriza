const TERMINATORS = new Set([".", "!", "?", "…"]);
const CLOSERS = new Set(['"', "'", "\u201d", "\u2019", ")", "]"]);
const SOFT_BREAKS = new Set([",", ";", ":"]);

const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "rev", "st", "jr", "sr",
  "vs", "etc", "eg", "ie", "approx", "inc", "ltd", "co", "no", "fig",
]);

export interface ChunkLimits {
  /** Preferred ceiling. A chunk runs to the last sentence end at or below it. */
  softMax: number;
  /** Absolute ceiling. A sentence longer than this is broken at punctuation. */
  hardMax: number;
  /** Release whatever remains, for when no more text is coming. */
  flush: boolean;
}

export interface ChunkResult {
  chunk: string;
  rest: string;
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
 * Offsets just past each sentence end. A terminator only closes a sentence
 * once whitespace follows, so a period still being typed does not split a
 * chunk early, and an abbreviation never closes one at all.
 */
function boundaries(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (!TERMINATORS.has(text[i])) continue;
    if (text[i] === "." && isAbbreviation(text, i)) continue;
    let j = i + 1;
    while (j < text.length && TERMINATORS.has(text[j])) j++;
    while (j < text.length && CLOSERS.has(text[j])) j++;
    if (j < text.length && /\s/.test(text[j])) {
      out.push(j);
      i = j;
    }
  }
  return out;
}

/** Last comma-class break before `limit`, else the last space, else `limit`. */
function forcedBreak(text: string, limit: number): number {
  for (let i = limit - 1; i > 0; i--) {
    if (SOFT_BREAKS.has(text[i])) return i + 1;
  }
  for (let i = limit - 1; i > 0; i--) {
    if (/\s/.test(text[i])) return i;
  }
  return limit;
}

function split(buffer: string, at: number): ChunkResult {
  return { chunk: buffer.slice(0, at).trim(), rest: buffer.slice(at) };
}

/**
 * Takes one synthesizable chunk off the front of `buffer`, or null when the
 * buffer holds nothing worth sending yet.
 *
 * Both limits are ceilings, so chunk length stays predictable and synthesis
 * time with it. Whole sentences are packed up to `softMax`; a single sentence
 * that overshoots is still kept intact as long as it fits `hardMax`, and only
 * one longer than that is broken at punctuation.
 */
export function takeChunk(
  buffer: string,
  limits: ChunkLimits,
): ChunkResult | null {
  if (buffer.trim() === "") return null;

  const { softMax, hardMax, flush } = limits;
  const bounds = boundaries(buffer);

  let at = -1;
  for (const b of bounds) {
    if (b <= softMax) at = b;
  }
  if (at === -1) {
    at = bounds.find((b) => b <= hardMax) ?? -1;
  }
  if (at !== -1) return split(buffer, at);

  if (buffer.length >= hardMax) {
    return split(buffer, forcedBreak(buffer, hardMax));
  }

  return flush ? split(buffer, buffer.length) : null;
}