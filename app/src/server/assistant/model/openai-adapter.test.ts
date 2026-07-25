import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: {
    OPENAI_API_KEY: "sk-test",
    OPENAI_TEXT_MODEL: "gpt-5.6-sol",
  },
}));
import { assertNoReasoningInText } from "./reasoning-sanitizer";
import { createOpenAIModelAdapter } from "./openai-adapter";
import { openAIStreamChunks } from "./fixtures/openai-stream-chunks";
import type { AssistantStreamEvent } from "./client";

function mockClientFromChunks(chunks: typeof openAIStreamChunks) {
  const requests: unknown[] = [];
  return {
    requests,
    chat: {
      completions: {
        create: async (request: unknown) => {
          requests.push(request);
          return ({
          async *[Symbol.asyncIterator]() {
            for (const chunk of chunks) {
              yield chunk;
            }
          },
          });
        },
      },
    },
  };
}

async function collectEvents(
  adapter: ReturnType<typeof createOpenAIModelAdapter>
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

describe("OpenAIModelAdapter", () => {
  it("uses Sol with tool-compatible reasoning disabled", async () => {
    const client = mockClientFromChunks(openAIStreamChunks);
    const adapter = createOpenAIModelAdapter({ client: client as never });

    await collectEvents(adapter);

    expect(client.requests[0]).toMatchObject({
      model: "gpt-5.6-sol",
      reasoning_effort: "none",
      stream: true,
    });
  });

  it("yields text_delta for content chunks and skips reasoning-only chunks", async () => {
    const adapter = createOpenAIModelAdapter({
      client: mockClientFromChunks(openAIStreamChunks) as never,
    });

    const events = await collectEvents(adapter);
    const textDeltas = events.filter((e) => e.type === "text_delta");

    expect(textDeltas).toEqual([
      { type: "text_delta", text: "Hello" },
      { type: "text_delta", text: " world" },
    ]);
  });

  it("yields tool_call after multi-chunk accumulation", async () => {
    const adapter = createOpenAIModelAdapter({
      client: mockClientFromChunks(openAIStreamChunks) as never,
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
    const adapter = createOpenAIModelAdapter({
      client: mockClientFromChunks(openAIStreamChunks) as never,
    });

    const events = await collectEvents(adapter);
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("serialized events pass assertNoReasoningInText", async () => {
    const adapter = createOpenAIModelAdapter({
      client: mockClientFromChunks(openAIStreamChunks) as never,
    });

    const events = await collectEvents(adapter);
    assertNoReasoningInText(JSON.stringify(events));
  });
});
