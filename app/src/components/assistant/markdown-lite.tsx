/**
 * Minimal inline markdown formatter for assistant chat bubbles.
 *
 * Supports a small, safe subset: **bold**, *italic*, `inline code`, tables
 * (GitHub style: a header row, a `| --- |` row, then the body rows) and
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

type TableAlign = "left" | "center" | "right";
type MarkdownTable = { header: string[]; align: TableAlign[]; rows: string[][]; end: number };

/** The cells of a table row: the outer pipes are optional, `\|` is a pipe inside a cell, and every cell is trimmed. */
function splitTableRow(line: string): string[] {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);
  const cells: string[] = [];
  let cell = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\\" && text[i + 1] === "|") {
      cell += "|";
      i += 1;
    } else if (ch === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

/** The alignment of each column when the line is a `| --- | :---: |` row; null when it is anything else. */
function readTableRule(line: string): TableAlign[] | null {
  if (!line.includes("-")) return null;
  const align: TableAlign[] = [];
  for (const cell of splitTableRow(line)) {
    if (!/^:?-+:?$/.test(cell)) return null;
    align.push(cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : "left");
  }
  return align;
}

/**
 * The table that starts at `lines[start]`, or null. A table is a header row followed by a rule row with the same number of columns; the body is every
 * following line that has a pipe, up to the first blank one. While the answer is still being written the end of the table may be missing: a header with
 * no rule yet is plain text, a header with its rule and no body is a table with only a header, and a last row that stops short is padded.
 */
function readTable(lines: string[], start: number): MarkdownTable | null {
  const head = lines[start];
  const rule = lines[start + 1];
  if (head === undefined || rule === undefined || !head.includes("|")) return null;
  const header = splitTableRow(head);
  const align = readTableRule(rule);
  if (!align || align.length !== header.length) return null;
  const rows: string[][] = [];
  let end = start + 2;
  while (end < lines.length && lines[end]!.trim() !== "" && lines[end]!.includes("|")) {
    const cells = splitTableRow(lines[end]!);
    // A last row that has only just begun ("|") is not a row yet.
    if (!(end === lines.length - 1 && cells.every((cell) => cell === ""))) rows.push(cells);
    end += 1;
  }
  return { header, align, rows, end };
}

const ALIGN_CLASS: Record<TableAlign, string> = { left: "text-left", center: "text-center", right: "text-right" };

function renderTable(table: MarkdownTable, key: string): ReactNode {
  const cell = (cells: string[], column: number) => renderInlineMarkdown(cells[column] ?? "");
  return (
    // The scroll region is focusable so the keyboard can reach a table wider than the conversation (on a phone, almost every one).
    <div
      key={key}
      tabIndex={0}
      data-testid="markdown-table"
      className="my-2 min-w-0 max-w-full overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
    >
      <table className="w-full border-collapse whitespace-normal text-left text-[13px] leading-snug">
        <thead className="bg-[var(--surface-inset)]">
          <tr>
            {table.header.map((_, column) => (
              <th
                key={column}
                scope="col"
                className={`min-w-[5.5rem] px-3 py-2 align-bottom text-xs font-semibold text-[var(--text-secondary)] ${ALIGN_CLASS[table.align[column]!]}`}
              >
                {cell(table.header, column)}
              </th>
            ))}
          </tr>
        </thead>
        {table.rows.length > 0 ? (
          <tbody>
            {table.rows.map((row, index) => (
              <tr key={index} className="border-t border-[var(--border-subtle)]">
                {table.header.map((_, column) => (
                  <td key={column} className={`min-w-[5.5rem] px-3 py-2 align-top text-[var(--text-primary)] ${ALIGN_CLASS[table.align[column]!]}`}>
                    {cell(row, column)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ) : null}
      </table>
    </div>
  );
}

/**
 * Renders a markdown-lite string as a block of React nodes, splitting on
 * newlines so each line becomes its own line, and drawing a table where
 * there is one. The caller wraps the result in a container with
 * appropriate spacing.
 */
export function renderMarkdownLite(input: string): ReactNode[] {
  const lines = input.split("\n");
  const nodes: ReactNode[] = [];
  for (let idx = 0; idx < lines.length; idx += 1) {
    const table = readTable(lines, idx);
    if (table) {
      nodes.push(renderTable(table, `table-${idx}`));
      idx = table.end - 1;
      continue;
    }
    nodes.push(
      <span key={`line-${idx}`} className="block">
        {renderInlineMarkdown(lines[idx]!)}
      </span>
    );
  }
  return nodes;
}
