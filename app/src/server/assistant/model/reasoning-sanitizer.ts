export const REASONING_DELTA_KEYS = [
  "reasoning_details",
  "reasoning_content",
  "thinking",
  "reasoning",
  "chain_of_thought",
] as const;

type ReasoningDeltaKey = (typeof REASONING_DELTA_KEYS)[number];

export interface SanitizedDelta {
  content?: string | null;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

export function stripReasoningFromDelta(
  delta: Record<string, unknown> | null | undefined
): SanitizedDelta {
  if (!delta) {
    return {};
  }

  const result: SanitizedDelta = {};

  if (typeof delta.content === "string") {
    result.content = delta.content;
  } else if (delta.content === null) {
    result.content = null;
  }

  if (Array.isArray(delta.tool_calls)) {
    result.tool_calls = delta.tool_calls as SanitizedDelta["tool_calls"];
  }

  return result;
}

const FORBIDDEN_SUBSTRINGS = [
  ...REASONING_DELTA_KEYS,
  '"reasoning"',
  '"thinking"',
  '"reasoning_details"',
  '"reasoning_content"',
  '"chain_of_thought"',
];

export function assertNoReasoningInText(text: string): void {
  const lower = text.toLowerCase();
  for (const forbidden of FORBIDDEN_SUBSTRINGS) {
    if (lower.includes(forbidden.toLowerCase())) {
      throw new Error(`Reasoning field detected in output: ${forbidden}`);
    }
  }

  for (const key of REASONING_DELTA_KEYS) {
    if (text.includes(`"${key}"`)) {
      throw new Error(`Reasoning key detected in serialized output: ${key}`);
    }
  }
}

export function hasReasoningKeys(delta: Record<string, unknown>): boolean {
  return REASONING_DELTA_KEYS.some((key: ReasoningDeltaKey) => key in delta);
}
