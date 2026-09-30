import { Fragment } from "react";

const URL_PATTERN = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;

function linkify(line: string) {
  return line.split(URL_PATTERN).map((part, index) =>
    index % 2 === 1 ? (
      <a
        key={index}
        href={part}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        className="text-primary underline break-all"
      >
        {part}
      </a>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

// Posts and replies are plain text: blank lines split paragraphs, single
// newlines stay line breaks, and web addresses become links. Nothing people
// write is ever parsed as HTML.
export function BoardText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  return (
    <div className={className}>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="whitespace-pre-wrap break-words">
          {linkify(paragraph)}
        </p>
      ))}
    </div>
  );
}
