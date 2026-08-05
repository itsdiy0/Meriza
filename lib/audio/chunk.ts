const TERMINATORS = new Set([".", "!", "?", "…"]);
const CLOSERS = new Set(['"', "'", "\u201d", "\u2019", ")", "]"]);
const SOFT_BREAKS = new Set([",", ";", ":"]);
const HARD_MAX = 400;

const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "rev", "st", "jr", "sr",
  "vs", "etc", "eg", "ie", "approx", "inc", "ltd", "co", "no", "fig",
]);

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
 * A chunk runs to the first sentence end at or past `targetChars`, so a small
 * target yields a fast opening clip and a larger one keeps later clips long
 * enough to sound continuous. An overlong sentence is broken at punctuation
 * rather than stalling the pipeline. `flush` releases whatever is left, for
 * when no more text is coming.
 */
export function takeChunk(
  buffer: string,
  targetChars: number,
  flush: boolean,
): ChunkResult | null {
  if (buffer.trim() === "") return null;

  for (const at of boundaries(buffer)) {
    if (at >= targetChars) return split(buffer, at);
  }

  if (buffer.length >= HARD_MAX) {
    return split(buffer, forcedBreak(buffer, HARD_MAX));
  }

  return flush ? split(buffer, buffer.length) : null;
}