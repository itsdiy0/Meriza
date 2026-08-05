const TERMINATORS = new Set([".", "!", "?", "…"]);
const CLOSERS = new Set(['"', "'", "\u201d", "\u2019", ")", "]"]);
const SOFT_BREAKS = new Set([",", ";", ":"]);

const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "rev", "st", "jr", "sr",
  "vs", "etc", "eg", "ie", "approx", "inc", "ltd", "co", "no", "fig",
]);

export interface ChunkLimits {
  /** Floor. Each request carries fixed overhead, so tiny chunks cost more
   *  time than the audio they return. */
  minChars: number;
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

/**
 * Split point inside a sentence, between `min` and `limit`: the last
 * comma-class break in range, else the last space, else `limit` itself.
 * Both ends are bounded, so a lone early comma cannot strand a fragment.
 */
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

function split(buffer: string, at: number): ChunkResult {
  return { chunk: buffer.slice(0, at).trim(), rest: buffer.slice(at) };
}

/**
 * Takes one synthesizable chunk off the front of `buffer`, or null when the
 * buffer holds nothing worth sending yet.
 *
 * Chunk length is bounded on both sides so synthesis time stays predictable:
 * whole sentences are packed up to `softMax`, and anything that would fall
 * below `minChars` is held back for the text behind it. A sentence too long
 * for `hardMax` is divided into even pieces rather than shaved from the
 * front, which would leave a tail too short to be worth its own request.
 */
export function takeChunk(
  buffer: string,
  limits: ChunkLimits,
): ChunkResult | null {
  if (buffer.trim() === "") return null;

  const { minChars, softMax, hardMax, flush } = limits;
  const bounds = boundaries(buffer);

  let at = -1;
  for (const b of bounds) {
    if (b >= minChars && b <= softMax) at = b;
  }
  if (at === -1) {
    at = bounds.find((b) => b >= minChars && b <= hardMax) ?? -1;
  }
  if (at !== -1) return split(buffer, at);

  const end = bounds.find((b) => b >= minChars) ?? (flush ? buffer.length : -1);

  if (end > hardMax) {
    const pieces = Math.ceil(end / hardMax);
    const target = Math.ceil(end / pieces);
    return split(buffer, forcedBreak(buffer, minChars, target));
  }

  if (buffer.length >= hardMax) {
    return split(buffer, forcedBreak(buffer, minChars, hardMax));
  }

  return flush ? split(buffer, buffer.length) : null;
}