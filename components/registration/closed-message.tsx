import { Fragment, type ReactNode } from "react";
import { GradientText, HeroShell } from "@/components/registration/ui";

// The admin-written closed message (registration_window.closed_message) is
// plain text with a little structure, so it can be laid out without a rich
// text editor:
//   - the first line is the headline; if it has more than one sentence, the
//     last one is shown in the brand gradient
//   - everything after it is the body, split into paragraphs on blank lines
//     (a single line break stays a line break)
//   - **text** is bold, and email addresses become mailto links
// A one-line message is just the headline, as before.

const INLINE_PATTERN = /\*\*(.+?)\*\*|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    if (match[1] !== undefined) {
      nodes.push(
        <strong key={start} className="font-semibold text-ignite-ink">
          {match[1]}
        </strong>,
      );
    } else {
      nodes.push(
        <a key={start} href={`mailto:${match[2]}`} className="font-semibold text-ignite-ink underline underline-offset-2">
          {match[2]}
        </a>,
      );
    }
    last = start + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderHeadline(line: string): ReactNode {
  const split = line.match(/^(.*[.!?])\s+(\S.*)$/);
  if (!split) return renderInline(line);
  return (
    <>
      {renderInline(split[1])} <GradientText>{renderInline(split[2])}</GradientText>
    </>
  );
}

export function ClosedMessageScreen({ message }: { message: string }) {
  const [headline, ...rest] = message.trim().split(/\r?\n/);
  const paragraphs = rest
    .join("\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <HeroShell label="g-IGNITE 2026" title={renderHeadline(headline.trim())}>
      {paragraphs.length > 0 && (
        <div className="flex flex-col gap-4 text-[15px] leading-[1.7]">
          {paragraphs.map((paragraph, i) => (
            <p key={i} className="m-0">
              {paragraph.split("\n").map((line, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  {renderInline(line.trim())}
                </Fragment>
              ))}
            </p>
          ))}
        </div>
      )}
    </HeroShell>
  );
}
