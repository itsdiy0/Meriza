interface RevealedTextProps {
  text: string;
}

/**
 * Renders text word by word so each one fades in as it appears. Keys are
 * positional, which is correct here: the revealed string only ever grows, so a
 * word keeps its index for the life of the message. Words already on screen
 * stay mounted and still, and only newly added ones animate.
 *
 * Whitespace is preserved as plain text between the spans, so line breaks and
 * indentation survive the parent's `whitespace-pre-wrap`.
 */
export default function RevealedText({ text }: RevealedTextProps) {
  return (
    <>
      {text.split(/(\s+)/).map((part, i) =>
        part === "" || /^\s/.test(part) ? (
          part
        ) : (
          <span key={i} className="animate-word-in">
            {part}
          </span>
        ),
      )}
    </>
  );
}