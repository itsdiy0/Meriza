export type Inline =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] };

export type Block =
  | { kind: "paragraph"; content: Inline[] }
  | { kind: "heading"; content: Inline[] }
  | { kind: "bullet"; content: Inline[] }
  | { kind: "ordered"; marker: string; content: Inline[] }
  | { kind: "code"; language: string; value: string }
  | { kind: "rule" };

const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const HEADING = /^\s{0,3}#{1,6}\s+/;
const QUOTE = /^\s{0,3}>\s?/;
const BULLET = /^\s*[-*+]\s+/;
const ORDERED = /^\s*(\d+)[.)]\s+/;
const FENCE = /^\s*(```|~~~)\s*([\w+#-]*)\s*$/;
const CODE = /`([^`\n]+)`/;
const STRONG = /(\*\*|__)(.+?)\1/;
const EM = /(?<![*\w])\*([^*\n]+)\*(?!\*)|(?<![_\w])_([^_\n]+)_(?![_\w])/;
const LINK = /\[([^\]]+)\]\([^)]*\)/;
const IMAGE = /!\[[^\]]*\]\([^)]*\)/g;

/**
 * Splits a span at the first match of `pattern`, recursing into both sides so
 * nesting works. Emphasis is resolved before links and after code, since a
 * backtick span is literal and must not be reinterpreted.
 */
function inline(text: string): Inline[] {
  if (text === "") return [];

  const code = CODE.exec(text);
  if (code !== null) {
    return [
      ...inline(text.slice(0, code.index)),
      { kind: "code", value: code[1] },
      ...inline(text.slice(code.index + code[0].length)),
    ];
  }

  const strong = STRONG.exec(text);
  if (strong !== null) {
    return [
      ...inline(text.slice(0, strong.index)),
      { kind: "strong", children: inline(strong[2]) },
      ...inline(text.slice(strong.index + strong[0].length)),
    ];
  }

  const em = EM.exec(text);
  if (em !== null) {
    return [
      ...inline(text.slice(0, em.index)),
      { kind: "em", children: inline(em[1] ?? em[2]) },
      ...inline(text.slice(em.index + em[0].length)),
    ];
  }

  const link = LINK.exec(text);
  if (link !== null) {
    return [
      ...inline(text.slice(0, link.index)),
      ...inline(link[1]),
      ...inline(text.slice(link.index + link[0].length)),
    ];
  }

  return [{ kind: "text", value: text }];
}

/**
 * Parses the markdown Meriza actually produces: emphasis, inline code, links,
 * fenced code, and one block per line otherwise. Line-per-block is correct
 * here rather than a limitation, because the speech pipeline already breaks a
 * list into one chunk per item, so the visual structure follows the spoken one.
 *
 * A fence that has not closed yet swallows the rest, which is what should
 * happen: everything after an opening fence is code until proven otherwise.
 *
 * Tables are still out of scope and fall through as paragraphs.
 */
export function parse(text: string): Block[] {
    const lines = text.split("\n");
    const blocks: Block[] = [];
  
    for (let i = 0; i < lines.length; i++) {
      const fence = lines[i].match(FENCE);
      if (fence !== null) {
        const marker = fence[1];
        const body: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trimStart().startsWith(marker)) {
          body.push(lines[i]);
          i++;
        }
        blocks.push({
          kind: "code",
          language: fence[2] ?? "",
          value: body.join("\n"),
        });
        continue;
      }
  
      const raw = lines[i];
      if (raw.trim() === "") continue;
      if (RULE.test(raw)) {
        blocks.push({ kind: "rule" });
        continue;
      }
  
      const body = raw.replace(IMAGE, "").replace(QUOTE, "");
  
      if (HEADING.test(body)) {
        blocks.push({
          kind: "heading",
          content: inline(body.replace(HEADING, "")),
        });
        continue;
      }
  
      const ordered = body.match(ORDERED);
      if (ordered !== null) {
        blocks.push({
          kind: "ordered",
          marker: ordered[1],
          content: inline(body.replace(ORDERED, "")),
        });
        continue;
      }
  
      if (BULLET.test(body)) {
        blocks.push({
          kind: "bullet",
          content: inline(body.replace(BULLET, "")),
        });
        continue;
      }
  
      blocks.push({ kind: "paragraph", content: inline(body.trim()) });
    }
  
    return blocks;
  }