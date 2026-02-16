import { type ReactElement, type ReactNode } from "react";

type MarkdownBlockLevel = 1 | 2 | 3 | 4 | 5 | 6;

type MarkdownNode = ReactNode;

const normalizeText = (value: string): string =>
  value.replace(/\r\n/g, "\n");

export const sanitizeMarkdownHref = (href: string): string | null => {
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return null;
  }
  const lowercase = trimmed.toLowerCase();
  if (lowercase.startsWith("http://") || lowercase.startsWith("https://")) {
    return trimmed;
  }
  if (lowercase.startsWith("mailto:")) {
    return trimmed;
  }
  return null;
};

function processSimpleInline(text: string, key: number): ReactElement {
  return <span key={key}>{text}</span>;
}

function processInlineMarkdown(text: string): MarkdownNode {
  const parts: MarkdownNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining) {
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const before = remaining.substring(0, linkMatch.index);
      if (before) {
        parts.push(processSimpleInline(before, key++));
      }
      const safeHref = sanitizeMarkdownHref(linkMatch[2]);
      if (safeHref) {
        parts.push(
          <a
            key={key++}
            href={safeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline"
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        parts.push(processSimpleInline(linkMatch[0], key++));
      }
      remaining = remaining.substring(
        (linkMatch.index ?? 0) + linkMatch[0].length,
      );
      continue;
    }

    const codeMatch = remaining.match(/`([^`]+)`/);
    if (codeMatch) {
      const before = remaining.substring(0, codeMatch.index);
      if (before) parts.push(processSimpleInline(before, key++));
      parts.push(
        <code
          key={key++}
          className="bg-surface px-1 py-0.5 rounded text-[12px] font-mono"
        >
          {codeMatch[1]}
        </code>,
      );
      remaining = remaining.substring((codeMatch.index ?? 0) + codeMatch[0].length);
      continue;
    }

    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    if (boldMatch) {
      const before = remaining.substring(0, boldMatch.index);
      if (before) parts.push(processSimpleInline(before, key++));
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
      remaining = remaining.substring((boldMatch.index ?? 0) + boldMatch[0].length);
      continue;
    }

    const italicMatch = remaining.match(/(^|[^\\])(\*|_)([^*_]+)\2/);
    if (italicMatch) {
      const before = remaining.substring(
        0,
        italicMatch.index! + (italicMatch[1] ? 1 : 0),
      );
      if (before) parts.push(processSimpleInline(before, key++));
      parts.push(<em key={key++}>{italicMatch[3]}</em>);
      remaining = remaining.substring((italicMatch.index ?? 0) + italicMatch[0].length);
      continue;
    }

    parts.push(remaining);
    break;
  }

  return <>{parts}</>;
}

const HEADING_CLASSNAMES: Record<MarkdownBlockLevel, string> = {
  1: "text-lg",
  2: "text-base",
  3: "text-sm",
  4: "text-sm",
  5: "text-xs",
  6: "text-[11px]",
};

export function renderMarkdown(text: string): ReactNode {
  const normalized = normalizeText(text).trim();
  if (!normalized) {
    return <span className="text-muted">No content yet. Switch to Edit to add markdown notes.</span>;
  }

  const splitMarkdownBlocks = (raw: string): string[] => {
    const lines = raw.split("\n");
    const chunks: string[] = [];
    const current: string[] = [];
    let inCodeBlock = false;

    const flush = (): void => {
      const next = current.join("\n").trim();
      if (!next) return;
      chunks.push(next);
      current.length = 0;
    };

    for (const line of lines) {
      const trimmed = line.trim();
      const isCodeFence = trimmed.startsWith("```");

      if (isCodeFence) {
        current.push(line);
        inCodeBlock = !inCodeBlock;
        continue;
      }

      if (inCodeBlock) {
        current.push(line);
        continue;
      }

      if (!trimmed) {
        flush();
        continue;
      }

      if (/^(#{1,6})\s+.+$/.test(trimmed)) {
        flush();
        current.push(line);
        flush();
        continue;
      }

      current.push(line);
    }

    flush();
    return chunks;
  };

  const blocks = splitMarkdownBlocks(normalized);
  const elements: ReactNode[] = [];

  blocks.forEach((block, blockIdx) => {
    const blockText = block.trim();
    if (!blockText) return;

    if (/^```/.test(blockText)) {
      const lines = blockText.split("\n");
      const code = lines.slice(1, Math.max(lines.length - 1, 1)).join("\n");
      elements.push(
        <pre
          key={blockIdx}
          className="bg-surface px-3 py-2 rounded-sm overflow-x-auto my-2"
        >
          <code className="font-mono text-[12px] whitespace-pre-wrap">{code}</code>
        </pre>,
      );
      return;
    }

    const headingMatch = blockText.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(6, Math.max(1, headingMatch[1].length)) as MarkdownBlockLevel;
      const textContent = processInlineMarkdown(headingMatch[2].trim());
      const Heading = `h${level}` as const;
      elements.push(
        <Heading key={blockIdx} className={`${HEADING_CLASSNAMES[level]} font-bold mt-2 mb-1`}>
          {textContent}
        </Heading>,
      );
      return;
    }

    if (/^(\d+\.\s)/.test(blockText) && /\n\d+\.\s/.test(blockText)) {
      const lines = blockText
        .split("\n")
        .filter((line) => /^\d+\.\s/.test(line));
      elements.push(
        <ol key={blockIdx} className="list-decimal pl-4 my-2 space-y-1">
          {lines.map((line, lineIdx) => (
            <li key={lineIdx}>{processInlineMarkdown(line.replace(/^\d+\.\s/, ""))}</li>
          ))}
        </ol>,
      );
      return;
    }

    if (/^>\s/.test(blockText) || /^>\s/.test(blockText.split("\n")[0])) {
      const lines = blockText
        .split("\n")
        .map((line) => line.replace(/^>\s?/, ""))
        .join("\n");
      elements.push(
        <blockquote key={blockIdx} className="border-l-2 border-border pl-3 text-muted my-2">
          {processInlineMarkdown(lines)}
        </blockquote>,
      );
      return;
    }

    if (/^[-*]\s\[[ xX]\]\s/.test(blockText)) {
      const items = blockText
        .split("\n")
        .filter((line) => /^[-*]\s\[[ xX]\]\s/.test(line))
        .map((line) => {
          const [, checked, text] = line.match(/^[-*]\s\[(x|X| )\]\s(.*)$/) ?? [];
          return { checked: checked?.toLowerCase() === "x", text: text ?? "" };
        });
      elements.push(
        <ul key={blockIdx} className="list-none pl-4 my-2 space-y-1">
          {items.map((item, idx) => (
            <li key={idx}>
              <span className={`mr-2 ${item.checked ? "text-ok" : "text-muted"}`}>{item.checked ? "☑" : "☐"}</span>
              {processInlineMarkdown(item.text)}
            </li>
          ))}
        </ul>,
      );
      return;
    }

    if (/^[-*]\s/.test(blockText)) {
      const items = blockText
        .split("\n")
        .filter((line) => /^[-*]\s/.test(line))
        .map((line) => line.replace(/^[-*]\s/, ""));
      elements.push(
        <ul key={blockIdx} className="list-disc pl-4 my-2 space-y-1">
          {items.map((item, idx) => (
            <li key={idx}>{processInlineMarkdown(item)}</li>
          ))}
        </ul>,
      );
      return;
    }

    elements.push(
      <p key={blockIdx} className="my-2 leading-6">
        {processInlineMarkdown(blockText)}
      </p>,
    );
  });

  return <div className="space-y-1">{elements}</div>;
}
