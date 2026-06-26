/**
 * Minimal inline markdown formatter for assistant chat bubbles.
 *
 * Supports a small, safe subset: **bold**, *italic*, `inline code`, and
 * preserves line breaks. HTML is escaped before formatting so user/assistant
 * content can never inject markup. Intentionally avoids a heavy dependency
 * (no react-markdown / remark / rehype in the repo) and avoids `dangerouslySetInnerHTML`.
 *
 * Returned structure is a tree of React nodes so the caller can render it
 * directly. The parser is intentionally line-based and single-pass.
 */

import type { ReactNode } from "react";

type InlineToken =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: InlineToken[] }
  | { kind: "italic"; value: InlineToken[] }
  | { kind: "code"; value: string };

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeMarkdownText(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

/**
 * Parses a single line into inline tokens. The grammar is deliberately
 * minimal: `**...**`, `*...*`, `` `...` ``. Markers do not nest across
 * types (no bold-inside-italic) to keep the parser single-pass and
 * predictable; matched content is recursed for the same marker type only.
 */
export function parseInlineMarkdown(line: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let i = 0;
  let buffer = "";

  const flush = () => {
    if (buffer) {
      tokens.push({ kind: "text", value: buffer });
      buffer = "";
    }
  };

  while (i < line.length) {
    const ch = line[i];

    if (ch === "`") {
      const end = line.indexOf("`", i + 1);
      if (end > i) {
        flush();
        tokens.push({ kind: "code", value: line.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if (ch === "*" && line[i + 1] === "*") {
      const end = findClosing(line, i + 2, "**");
      if (end > i + 1) {
        flush();
        tokens.push({
          kind: "bold",
          value: parseInlineMarkdown(line.slice(i + 2, end)),
        });
        i = end + 2;
        continue;
      }
    }

    if (ch === "*" && line[i + 1] !== "*") {
      const end = findClosing(line, i + 1, "*");
      if (end > i) {
        flush();
        tokens.push({
          kind: "italic",
          value: parseInlineMarkdown(line.slice(i + 1, end)),
        });
        i = end + 1;
        continue;
      }
    }

    buffer += ch;
    i += 1;
  }

  flush();
  return tokens;
}

function findClosing(source: string, start: number, marker: string): number {
  const idx = source.indexOf(marker, start);
  return idx === -1 ? -1 : idx;
}

export function renderInlineMarkdown(line: string): ReactNode[] {
  return parseInlineMarkdown(line).map((token, idx) => {
    switch (token.kind) {
      case "text":
        return token.value;
      case "bold":
        return <strong key={`b-${idx}`}>{renderInlineTokenChildren(token.value)}</strong>;
      case "italic":
        return <em key={`i-${idx}`}>{renderInlineTokenChildren(token.value)}</em>;
      case "code":
        return (
          <code
            key={`c-${idx}`}
            className="rounded bg-[var(--surface-base)] px-1 py-0.5 font-mono text-[12px] text-[var(--text-primary)]"
          >
            {token.value}
          </code>
        );
    }
  });
}

function renderInlineTokenChildren(tokens: InlineToken[]): ReactNode[] {
  return tokens.map((token, idx) => {
    const key = idx;
    switch (token.kind) {
      case "text":
        return token.value;
      case "bold":
        return <strong key={key}>{renderInlineTokenChildren(token.value)}</strong>;
      case "italic":
        return <em key={key}>{renderInlineTokenChildren(token.value)}</em>;
      case "code":
        return (
          <code key={key} className="rounded bg-[var(--surface-base)] px-1 py-0.5 font-mono text-[12px]">
            {token.value}
          </code>
        );
    }
  });
}

/**
 * Renders a markdown-lite string as a block of React nodes, splitting on
 * newlines so each line becomes its own line. The caller wraps the result
 * in a container with appropriate spacing.
 */
export function renderMarkdownLite(input: string): ReactNode[] {
  const lines = input.split("\n");
  return lines.map((line, idx) => (
    <span key={`line-${idx}`} className="block">
      {renderInlineMarkdown(line)}
    </span>
  ));
}
