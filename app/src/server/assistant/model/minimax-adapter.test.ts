import { describe, it, expect } from "vitest";
import { assertNoReasoningInText } from "./reasoning-sanitizer";
import { createMiniMaxModelAdapter } from "./minimax-adapter";
import { minimaxStreamChunks } from "./fixtures/minimax-stream-chunks";
import type { AssistantStreamEvent } from "./client";

function mockClientFromChunks(chunks: typeof minimaxStreamChunks) {
  return {
    chat: {
      completions: {
        create: async () => ({
          async *[Symbol.asyncIterator]() {
            for (const chunk of chunks) {
              yield chunk;
            }
          },
        }),
      },
    },
  };
}

async function collectEvents(
  adapter: ReturnType<typeof createMiniMaxModelAdapter>
): Promise<AssistantStreamEvent[]> {
  const events: AssistantStreamEvent[] = [];
  for await (const event of adapter.stream({
    systemPrompt: "You are helpful.",
    messages: [{ role: "user", content: "Hi" }],
  })) {
    events.push(event);
  }
  return events;
}

describe("MiniMaxModelAdapter", () => {
  it("yields text_delta for content chunks and skips reasoning-only chunks", async () => {
    const adapter = createMiniMaxModelAdapter({
      client: mockClientFromChunks(minimaxStreamChunks) as never,
    });

    const events = await collectEvents(adapter);
    const textDeltas = events.filter((e) => e.type === "text_delta");

    expect(textDeltas).toEqual([
      { type: "text_delta", text: "Hello" },
      { type: "text_delta", text: " world" },
    ]);
  });

  it("yields tool_call after multi-chunk accumulation", async () => {
    const adapter = createMiniMaxModelAdapter({
      client: mockClientFromChunks(minimaxStreamChunks) as never,
    });

    const events = await collectEvents(adapter);
    const toolCall = events.find((e) => e.type === "tool_call");

    expect(toolCall).toEqual({
      type: "tool_call",
      id: "call_abc",
      name: "get_thread_context",
      argumentsJson: "{}",
    });
  });

  it("ends with done event", async () => {
    const adapter = createMiniMaxModelAdapter({
      client: mockClientFromChunks(minimaxStreamChunks) as never,
    });

    const events = await collectEvents(adapter);
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("serialized events pass assertNoReasoningInText", async () => {
    const adapter = createMiniMaxModelAdapter({
      client: mockClientFromChunks(minimaxStreamChunks) as never,
    });

    const events = await collectEvents(adapter);
    assertNoReasoningInText(JSON.stringify(events));
  });
});
