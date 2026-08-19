import { useMemo } from "react";
import { parse, type Block, type Inline } from "@/lib/transcript/markdown";

interface RevealedTextProps {
  text: string;
  /** Words up to this ordinal have been spoken. The rest are held invisible. */
  visibleWords: number;
}

interface Cursor {
  index: number;
}

/**
 * Splits a run into words, each its own span so it can fade in on its own.
 * Ordinals come from a cursor walked across the whole message, so a word keeps
 * its number wherever it sits in the tree and settled text never re-animates.
 */
function words(value: string, cursor: Cursor, visible: number) {
  return value.split(/(\s+)/).map((part, i) => {
    if (part === "" || /^\s/.test(part)) return part;
    const shown = cursor.index < visible;
    cursor.index++;
    return (
      <span
        key={`${cursor.index}-${i}`}
        className={shown ? "animate-word-in" : "invisible"}
      >
        {part}
      </span>
    );
  });
}

function renderInline(
  content: Inline[],
  cursor: Cursor,
  visible: number,
): React.ReactNode {
  return content.map((token, i) => {
    switch (token.kind) {
      case "text":
        return <span key={i}>{words(token.value, cursor, visible)}</span>;
      case "code":
        return (
          <code
            key={i}
            className="rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)] px-1 py-0.5 font-mono text-[0.9em]"
          >
            {words(token.value, cursor, visible)}
          </code>
        );
      case "strong":
        return (
          <strong key={i} className="font-semibold text-white">
            {renderInline(token.children, cursor, visible)}
          </strong>
        );
      case "em":
        return (
          <em key={i} className="italic">
            {renderInline(token.children, cursor, visible)}
          </em>
        );
    }
  });
}

function renderBlock(
  block: Block,
  key: number,
  cursor: Cursor,
  visible: number,
): React.ReactNode {
  switch (block.kind) {
    // Code takes one ordinal for the whole block and appears as a unit, since
    // nothing speaks it and there is no cadence to follow.
    case "code": {
      const shown = cursor.index < visible;
      cursor.index++;
      return (
        <pre
          key={key}
          className={`overflow-x-auto rounded-lg border border-[var(--line)] bg-[color-mix(in_srgb,var(--ink-2)_60%,transparent)] p-3 ${
            shown ? "animate-word-in" : "invisible"
          }`}
        >
          <code className="font-mono text-[13px] leading-relaxed text-[var(--text)]">
            {block.value}
          </code>
        </pre>
      );
    }
    case "rule":
      return (
        <hr key={key} className="my-1 border-0 border-t border-[var(--line)]" />
      );
    case "heading":
      return (
        <div
          key={key}
          className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]"
        >
          {renderInline(block.content, cursor, visible)}
        </div>
      );
    case "bullet":
      return (
        <div key={key} className="flex gap-2">
          <span aria-hidden className="text-[var(--muted)]">
            &bull;
          </span>
          <span>{renderInline(block.content, cursor, visible)}</span>
        </div>
      );
    case "ordered":
      return (
        <div key={key} className="flex gap-2">
          <span aria-hidden className="tabular-nums text-[var(--muted)]">
            {block.marker}.
          </span>
          <span>{renderInline(block.content, cursor, visible)}</span>
        </div>
      );
    case "paragraph":
      return <div key={key}>{renderInline(block.content, cursor, visible)}</div>;
  }
}

/**
 * Renders a reply as markdown, with each word fading in as it is spoken. Keys
 * are positional and the tree is parsed from complete chunks, so a word keeps
 * its identity for the life of the message: settled words stay mounted and
 * still, and only newly audible ones animate.
 */
export default function RevealedText({
  text,
  visibleWords,
}: RevealedTextProps) {
  const blocks = useMemo(() => parse(text), [text]);
  const cursor: Cursor = { index: 0 };

  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block, i) => renderBlock(block, i, cursor, visibleWords))}
    </div>
  );
}