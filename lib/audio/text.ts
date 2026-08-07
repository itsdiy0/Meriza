const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const FENCE = /^\s*(```|~~~)/;
const STRUCTURE = /^(\s{0,3}#{1,6}\s+|\s{0,3}>\s?|\s*[-*+]\s+|\s*\d+[.)]\s+)/;
const TERMINATED = /[.!?…:;,]$/;

const KEYCAP = /[0-9#*]\uFE0F?\u20E3/g;
const FLAG = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;
const PICTOGRAPH =
  /\p{Extended_Pictographic}(\p{Emoji_Modifier}|\uFE0F)?(\u200D\p{Extended_Pictographic}(\p{Emoji_Modifier}|\uFE0F)?)*/gu;
const JOINERS = /[\uFE0E\uFE0F\u200D]/g;

/**
 * Strips markdown and emoji the engine would otherwise pronounce. Applied per
 * chunk rather than per streamed delta, because a delta can split an emphasis
 * marker in half while a chunk is always at least one whole sentence.
 *
 * Headings and list items are terminated with a period when they lack one, so
 * the engine renders the falling intonation and short pause that carries the
 * structure. Without it a list is read as one long clause.
 *
 * Line structure then collapses to spaces. Sequences are removed longest first
 * so a keycap or flag is not left as a stray digit or half a pair.
 */
export function speakable(text: string): string {
  const lines = text.split("\n").map((raw) => {
    if (RULE.test(raw) || FENCE.test(raw)) return "";

    const structural = STRUCTURE.test(raw);
    const body = raw.replace(STRUCTURE, "").trim();
    if (body === "") return "";

    return structural && !TERMINATED.test(body) ? `${body}.` : body;
  });

  return lines
    .join(" ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, "$1$2")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(KEYCAP, " ")
    .replace(FLAG, " ")
    .replace(PICTOGRAPH, " ")
    .replace(JOINERS, "")
    .replace(/\s+/g, " ")
    .trim();
}