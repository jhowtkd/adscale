import {
  ASSISTANT_SSE_EVENTS,
  type AssistantSseEventType,
} from "@/server/assistant/stream/sse";

const SSE_FRAME_SEPARATOR = "\n\n";
const DENYLIST_KEYS = new Set(["reasoning", "thinking"]);

export interface AssistantSseFrame {
  event: AssistantSseEventType;
  data: Record<string, unknown>;
}

function isAssistantSseEventType(value: string): value is AssistantSseEventType {
  return (ASSISTANT_SSE_EVENTS as readonly string[]).includes(value);
}

function sanitizeSseData(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!DENYLIST_KEYS.has(key)) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function parseAssistantSseFrame(block: string): AssistantSseFrame | null {
  const trimmed = block.trim();
  if (!trimmed) {
    return null;
  }

  let event: string | null = null;
  let dataLine: string | null = null;

  for (const line of trimmed.split("\n")) {
    if (line.startsWith("event: ")) {
      event = line.slice("event: ".length).trim();
    } else if (line.startsWith("data: ")) {
      dataLine = line.slice("data: ".length).trim();
    }
  }

  if (!event || !dataLine || !isAssistantSseEventType(event)) {
    return null;
  }

  try {
    const parsed = JSON.parse(dataLine) as Record<string, unknown>;
    return {
      event,
      data: sanitizeSseData(parsed),
    };
  } catch {
    return null;
  }
}

export async function* readAssistantSseStream(
  response: Response,
  signal?: AbortSignal
): AsyncGenerator<AssistantSseFrame> {
  const reader = response.body?.getReader();
  if (!reader) {
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) {
        break;
      }

      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let separatorIndex = buffer.indexOf(SSE_FRAME_SEPARATOR);
      while (separatorIndex !== -1) {
        const block = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + SSE_FRAME_SEPARATOR.length);

        const frame = parseAssistantSseFrame(block);
        if (frame) {
          yield frame;
        }

        if (signal?.aborted) {
          return;
        }

        separatorIndex = buffer.indexOf(SSE_FRAME_SEPARATOR);
      }
    }

    const trailing = parseAssistantSseFrame(buffer);
    if (trailing && !signal?.aborted) {
      yield trailing;
    }
  } finally {
    reader.releaseLock();
  }
}
