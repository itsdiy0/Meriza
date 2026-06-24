import type { Beat, Score } from "@/lib/orb/motion/types";

export const TICK_MS = 80;
const MAX_INPUT_CHARS = 4000;
const MAX_BEATS = 6000;
const WORD_TICK_CAP = 12;

const VOWELS = new Set([..."aeiouy"]);
const SENTENCE = new Set([".", "!", "?"]);
const CLAUSE = new Set([",", ";", ":"]);

type Category = "space" | "sentence" | "clause" | "word";

function categorize(ch: string): Category {
  if (/\s/u.test(ch)) return "space";
  if (SENTENCE.has(ch)) return "sentence";
  if (CLAUSE.has(ch)) return "clause";
  return "word";
}

/**
 * Stable hash of a word's code points, normalized to 0..1. The same word always
 * yields the same value, so its wobble frequency is identical across calls.
 */
function wordFreq(word: string): number {
  let h = 7;
  for (const ch of word) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return (h % 1000) / 1000;
}

/** Per-character amplitude. Latin vowels sustain; consonants are shorter; any
 * other script, digit, or symbol falls back to a code-point-derived value so a
 * non-Latin string still performs rather than going silent. */
function charAmp(ch: string): number {
  const code = ch.codePointAt(0)!;
  const lower = ch.toLowerCase();
  if (VOWELS.has(lower)) return 0.6 + (code % 5) / 12;
  if (/[a-z]/.test(lower)) return 0.25 + (code % 4) / 16;
  if (/\p{L}/u.test(ch)) return 0.5 + (code % 5) / 14;
  if (/\p{N}/u.test(ch)) return 0.4 + (code % 4) / 16;
  return 0.3 + (code % 4) / 16;
}

export function textToScore(
  text: string,
  opts?: { tickMs?: number },
): Score {
  const tickMs = opts?.tickMs ?? TICK_MS;
  const beats: Beat[] = [];
  if (text.trim() === "") return { beats, tickMs };

  const chars = Array.from(text.slice(0, MAX_INPUT_CHARS));
  let i = 0;
  while (i < chars.length && beats.length < MAX_BEATS) {
    const category = categorize(chars[i]);
    let j = i;
    while (j < chars.length && categorize(chars[j]) === category) j++;
    const token = chars.slice(i, j).join("");
    i = j;

    if (category === "space") {
      beats.push({ amp: 0.05, freq: 0.2 });
    } else if (category === "sentence" || category === "clause") {
      const rest = category === "sentence" ? 3 : 2;
      for (let k = 0; k < rest && beats.length < MAX_BEATS; k++) {
        beats.push({ amp: 0.04, freq: 0.15 });
      }
      if (category === "sentence" && beats.length > 0) {
        beats[beats.length - 1].ripple = true;
      }
    } else {
      const freq = wordFreq(token);
      const letters = Array.from(token);
      const span = Math.min(letters.length, WORD_TICK_CAP);
      for (let k = 0; k < span && beats.length < MAX_BEATS; k++) {
        beats.push({ amp: charAmp(letters[k]), freq });
      }
    }
  }

  return { beats, tickMs };
}
