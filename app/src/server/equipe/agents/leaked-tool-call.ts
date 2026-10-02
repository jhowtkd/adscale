// A tool call the provider handed back as TEXT (ticket 15, item 1).
//
// With extended thinking, Opus sometimes writes its call in the answer text, in the syntax it was trained on
// (`<invoke name="…"><parameter name="…">…</parameter></invoke>`), and stops with `stop_reason: tool_use` but without
// a `tool_use` block. Seen in 2 of 9 real turns of the free conversation. Left alone, the client would read the markup
// inside the answer and the call would never run. The text is always cleaned of the markup. The call is handed back
// only when the markup CLOSES the text, as in every leak observed: markup in the middle of a sentence is a quotation
// (of a passage of the brand's own site, say), never a call, and the strategist honours the call only for the two
// harmless closing tools and only when the provider stopped to call a tool.

export type LeakedToolCall = { name: string; args: Record<string, unknown> };

// The family the syntax comes in: with or without the namespace the provider's own prompt format uses. The opener is the tag itself
// (`<function_calls>`, `<invoke name=…>`, `<invoke>`): a word that merely starts like it (`<invoke-widget>`) is text.
const MARKUP_START = /<(?:antml:)?(?:function_calls\s*>|invoke(?:\s|>))/i;
const MARKUP_END = /<\/(?:antml:)?(?:invoke|function_calls)>/gi;
// `name="x"` or `name='x'`: the name is capture group 1 or 2.
const NAME = String.raw`name\s*=\s*(?:"([^"]+)"|'([^']+)')`;
const INVOKE_OPEN = new RegExp(String.raw`<(?:antml:)?invoke\s+${NAME}\s*>`, "i");
const INVOKE_CLOSE = /<\/(?:antml:)?invoke>/i;
const PARAMETER = new RegExp(String.raw`<(?:antml:)?parameter\s+${NAME}\s*>([\s\S]*?)<\/(?:antml:)?parameter>`, "gi");

/**
 * A parameter written as text: a JSON value when it is one (a list of suggestions), the text itself otherwise. The answer is always text: one that
 * happens to read as JSON ("[1] Ponto um…" is not, but `["a"]` is) would otherwise stop being a string and be refused.
 */
function parameterValue(name: string, raw: string): unknown {
  const value = raw.trim();
  if (name !== "resposta" && (value.startsWith("[") || value.startsWith("{"))) {
    try { return JSON.parse(value) as unknown; } catch { /* a plain string that merely starts with a bracket */ }
  }
  return value;
}

/**
 * Takes a leaked call out of an answer. `text` is what the client may read: the text before and after the markup, in
 * order. `call` is the first call the markup spells out, and only when nothing but whitespace follows the markup (the
 * signature of the leak: the call is the last thing the model wrote).
 */
export function splitLeakedToolCall(text: string): { text: string; call?: LeakedToolCall } {
  const start = text.search(MARKUP_START);
  if (start < 0) return { text };
  const blob = text.slice(start);
  const last = [...blob.matchAll(MARKUP_END)].at(-1);
  // A cut-off call (the model ran out of room) has no closer: everything from the opener on is markup.
  const end = last ? start + last.index + last[0].length : text.length;
  const cleaned = `${text.slice(0, start)}${text.slice(end)}`.trim();
  const closesTheText = text.slice(end).trim() === "";
  const open = INVOKE_OPEN.exec(blob);
  if (!open || !closesTheText) return { text: cleaned };
  const body = blob.slice(open.index + open[0].length).split(INVOKE_CLOSE)[0] ?? "";
  const args: Record<string, unknown> = {};
  for (const match of body.matchAll(PARAMETER)) {
    const parameter = (match[1] ?? match[2])!;
    args[parameter] = parameterValue(parameter, match[3]!);
  }
  const name = open[1] ?? open[2];
  return name ? { text: cleaned, call: { name, args } } : { text: cleaned };
}
