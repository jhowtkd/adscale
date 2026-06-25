export const ASSISTANT_SSE_EVENTS = [
  "text_delta",
  "tool_summary",
  "action_card",
  "done",
  "error",
] as const;

export type AssistantSseEventType = (typeof ASSISTANT_SSE_EVENTS)[number];

export function encodeAssistantSseEvent(
  event: AssistantSseEventType,
  data: Record<string, unknown>
): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}
