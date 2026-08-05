const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const FENCE = /^\s*(```|~~~)/;

/**
 * Strips markdown the engine would otherwise pronounce. Applied per chunk
 * rather than per streamed delta, because a delta can split an emphasis
 * marker in half while a chunk is always at least one whole sentence.
 *
 * Line structure collapses to spaces: headings, list markers, and quote
 * carets are punctuation for the eye, and the pause they imply is already
 * carried by the chunk boundary.
 */
export function speakable(text: string): string {
  const lines = text.split("\n").map((raw) => {
    if (RULE.test(raw) || FENCE.test(raw)) return "";
    return raw
      .replace(/^\s{0,3}#{1,6}\s+/, "")
      .replace(/^\s{0,3}>\s?/, "")
      .replace(/^\s*[-*+]\s+/, "")
      .replace(/^\s*\d+[.)]\s+/, "");
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
    .replace(/\s+/g, " ")
    .trim();
}