// A tool call the provider handed back as TEXT (ticket 15, item 1).
//
// With extended thinking, Opus sometimes writes its call in the answer text, in the syntax it was trained on
// (`<invoke name="…"><parameter name="…">…</parameter></invoke>`), and stops with `stop_reason: tool_use` but without
// a `tool_use` block. Seen in 2 of 9 real turns of the free conversation. Left alone, the client would read the markup
// inside the answer and the call would never run. The text is cleaned, and the call is handed back so the strategist
// can honour it when it is one of the two harmless closing tools.

export type LeakedToolCall = { name: string; args: Record<string, unknown> };

// The family the syntax comes in: with or without the namespace the provider's own prompt format uses.
const MARKUP_START = /<(?:antml:)?(?:function_calls|invoke)\b/i;
const MARKUP_END = /<\/(?:antml:)?(?:invoke|function_calls)>/gi;
// `name="x"` or `name='x'`: the name is capture group 1 or 2.
const NAME = String.raw`name\s*=\s*(?:"([^"]+)"|'([^']+)')`;
const INVOKE_OPEN = new RegExp(String.raw`<(?:antml:)?invoke\s+${NAME}\s*>`, "i");
const INVOKE_CLOSE = /<\/(?:antml:)?invoke>/i;
const PARAMETER = new RegExp(String.raw`<(?:antml:)?parameter\s+${NAME}\s*>([\s\S]*?)<\/(?:antml:)?parameter>`, "gi");

/** A parameter written as text: a JSON value when it is one (a list of suggestions), the text itself otherwise. */
function parameterValue(raw: string): unknown {
  const value = raw.trim();
  if (value.startsWith("[") || value.startsWith("{")) {
    try { return JSON.parse(value) as unknown; } catch { /* a plain string that merely starts with a bracket */ }
  }
  return value;
}

/**
 * Takes a leaked call out of an answer. `text` is what the client may read: the text before and after the markup, in
 * order. `call` is the first call the markup spells out, when it can be read.
 */
export function splitLeakedToolCall(text: string): { text: string; call?: LeakedToolCall } {
  const start = text.search(MARKUP_START);
  if (start < 0) return { text };
  const blob = text.slice(start);
  const last = [...blob.matchAll(MARKUP_END)].at(-1);
  // A cut-off call (the model ran out of room) has no closer: everything from the opener on is markup.
  const end = last ? start + last.index + last[0].length : text.length;
  const cleaned = `${text.slice(0, start)}${text.slice(end)}`.trim();
  const open = INVOKE_OPEN.exec(blob);
  if (!open) return { text: cleaned };
  const body = blob.slice(open.index + open[0].length).split(INVOKE_CLOSE)[0] ?? "";
  const args: Record<string, unknown> = {};
  for (const match of body.matchAll(PARAMETER)) args[(match[1] ?? match[2])!] = parameterValue(match[3]!);
  const name = open[1] ?? open[2];
  return name ? { text: cleaned, call: { name, args } } : { text: cleaned };
}
