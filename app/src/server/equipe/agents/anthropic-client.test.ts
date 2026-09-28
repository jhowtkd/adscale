// Anthropic Messages API client over a fake SDK (no network, #588).

import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ANTHROPIC_MAX_RETRIES,
  AnthropicEquipeModelClient,
  createAnthropicSdk,
  type AnthropicMessageResponse,
  type AnthropicResponseBlock,
  type AnthropicSdkLike,
} from "./anthropic-client";

/** Fake SDK: records params, replays scripted messages. */
class FakeAnthropicSdk implements AnthropicSdkLike {
  readonly params: Anthropic.MessageCreateParamsNonStreaming[] = [];

  constructor(private readonly script: AnthropicMessageResponse[]) {}

  messages = {
    create: async (
      params: Anthropic.MessageCreateParamsNonStreaming,
    ): Promise<AnthropicMessageResponse> => {
      this.params.push(params);
      const next = this.script.shift();
      if (!next) throw new Error("fakeAnthropicOutOfResponses");
      return next;
    },
  };
}

function message(
  content: AnthropicResponseBlock[],
  overrides: Partial<AnthropicMessageResponse> = {},
): AnthropicMessageResponse {
  return {
    content,
    stop_reason: "end_turn",
    usage: { input_tokens: 10, output_tokens: 5 },
    ...overrides,
  };
}

const textMessage = (text: string, overrides: Partial<AnthropicMessageResponse> = {}) =>
  message([{ type: "text", text }], overrides);

describe("createAnthropicSdk", () => {
  it("builds the SDK with the key and the client-owned retry budget", () => {
    const sdk = createAnthropicSdk("anthropic-test-key");
    expect(sdk.apiKey).toBe("anthropic-test-key");
    expect(sdk.maxRetries).toBe(ANTHROPIC_MAX_RETRIES);
    expect(sdk.maxRetries).toBe(3);
  });
});

describe("AnthropicEquipeModelClient", () => {
  it("joins system prompts top-level, always sends effort, and never thinking/temperature", async () => {
    const sdk = new FakeAnthropicSdk([textMessage("ok")]);
    const client = new AnthropicEquipeModelClient({ sdk });
    await client.chat({
      model: "claude-opus-5-5",
      messages: [
        { role: "system", content: "Primeira." },
        { role: "system", content: "Segunda." },
        { role: "user", content: "Oi" },
      ],
      effort: "high",
      maxTokens: 16000,
    });
    const sent = sdk.params[0]!;
    expect(sent.system).toBe("Primeira.\n\nSegunda.");
    expect(sent.messages.some((m) => m.role === "system")).toBe(false);
    expect(sent.output_config).toMatchObject({ effort: "high" });
    expect(sent).not.toHaveProperty("thinking");
    expect(sent).not.toHaveProperty("temperature");
    expect(sent).not.toHaveProperty("top_p");
    expect(sent).not.toHaveProperty("top_k");
    expect(sent).not.toHaveProperty("tool_choice");
    expect(sent.max_tokens).toBe(16000);
  });

  it("defaults effort to medium (never minimal) and max_tokens to 16000", async () => {
    const sdk = new FakeAnthropicSdk([textMessage("a"), textMessage("b")]);
    const client = new AnthropicEquipeModelClient({ sdk });
    await client.chat({ model: "claude-opus-5-5", messages: [{ role: "user", content: "Oi" }] });
    await client.chat({
      model: "claude-opus-5-5",
      messages: [{ role: "user", content: "Oi" }],
      effort: "minimal",
    });
    expect(sdk.params[0]!.output_config).toMatchObject({ effort: "medium" });
    expect(sdk.params[0]!.max_tokens).toBe(16000);
    expect(sdk.params[1]!.output_config).toMatchObject({ effort: "medium" });
  });

  it("maps tools and reads tool_use blocks back into tool calls", async () => {
    const sdk = new FakeAnthropicSdk([
      message(
        [
          { type: "thinking", text: "ignored for content" },
          { type: "text", text: "Vou consultar." },
          { type: "tool_use", id: "toolu-1", name: "get_goals", input: { limit: 3 } },
        ],
        { stop_reason: "tool_use" },
      ),
    ]);
    const client = new AnthropicEquipeModelClient({ sdk });
    const response = await client.chat({
      model: "claude-opus-5-5",
      messages: [{ role: "user", content: "Metas?" }],
      tools: [{ name: "get_goals", description: "Read goals", parameters: { type: "object" } }],
      effort: "high",
      maxTokens: 16000,
    });
    expect(sdk.params[0]!.tools).toEqual([
      { name: "get_goals", description: "Read goals", input_schema: { type: "object" } },
    ]);
    expect(response).toMatchObject({
      content: "Vou consultar.",
      toolCalls: [{ id: "toolu-1", name: "get_goals", argumentsJson: JSON.stringify({ limit: 3 }) }],
      usage: { inputTokens: 10, outputTokens: 5 },
      stopReason: "tool_calls",
    });
  });

  it("merges consecutive tool results into one user message", async () => {
    const sdk = new FakeAnthropicSdk([textMessage("feito")]);
    const client = new AnthropicEquipeModelClient({ sdk });
    await client.chat({
      model: "claude-opus-5-5",
      messages: [
        { role: "user", content: "Vai" },
        {
          role: "assistant",
          content: null,
          toolCalls: [
            { id: "toolu-1", name: "get_goals", argumentsJson: "{}" },
            { id: "toolu-2", name: "get_account_state", argumentsJson: "{}" },
          ],
        },
        { role: "tool", toolCallId: "toolu-1", content: '{"goals":[]}' },
        { role: "tool", toolCallId: "toolu-2", content: '{"status":"ok"}' },
      ],
      effort: "high",
      maxTokens: 16000,
    });
    const sent = sdk.params[0]!;
    expect(sent.messages).toHaveLength(3);
    const results = sent.messages[2]!;
    expect(results.role).toBe("user");
    expect(results.content).toEqual([
      { type: "tool_result", tool_use_id: "toolu-1", content: '{"goals":[]}' },
      { type: "tool_result", tool_use_id: "toolu-2", content: '{"status":"ok"}' },
    ]);
    // The assistant turn rebuilt without providerContent: text skipped
    // (null), tool calls as tool_use blocks, no thinking blocks.
    expect(sent.messages[1]).toEqual({
      role: "assistant",
      content: [
        { type: "tool_use", id: "toolu-1", name: "get_goals", input: {} },
        { type: "tool_use", id: "toolu-2", name: "get_account_state", input: {} },
      ],
    });
  });

  it("maps image urls and data urls to image blocks", async () => {
    const sdk = new FakeAnthropicSdk([textMessage("ok"), textMessage("ok")]);
    const client = new AnthropicEquipeModelClient({ sdk });
    const base = {
      model: "claude-opus-5-5",
      effort: "high" as const,
      maxTokens: 16000,
    };
    await client.chat({
      ...base,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "brief" },
            { type: "image_url", image_url: { url: "https://assets.example.com/peca.png" } },
          ],
        },
      ],
    });
    await client.chat({
      ...base,
      messages: [
        {
          role: "user",
          content: [{ type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } }],
        },
      ],
    });
    expect(sdk.params[0]!.messages[0]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "brief" },
        { type: "image", source: { type: "url", url: "https://assets.example.com/peca.png" } },
      ],
    });
    expect(sdk.params[1]!.messages[0]).toEqual({
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: "aGVsbG8=" } },
      ],
    });
  });

  it("replays assistant providerContent verbatim (preserved thinking)", async () => {
    const sdk = new FakeAnthropicSdk([textMessage("done")]);
    const client = new AnthropicEquipeModelClient({ sdk });
    const providerContent = [
      { type: "thinking", thinking: "r-a-c-i-o-c-i-n-i-o", signature: "sig-1" },
      { type: "text", text: "Parcial" },
      { type: "tool_use", id: "toolu-9", name: "get_goals", input: { a: 1 } },
    ];
    await client.chat({
      model: "claude-opus-5-5",
      messages: [
        { role: "user", content: "Vai" },
        { role: "assistant", content: "IGNORED", toolCalls: [], providerContent },
      ],
      effort: "high",
      maxTokens: 16000,
    });
    const replayed = sdk.params[0]!.messages[1]!;
    expect(replayed.role).toBe("assistant");
    // Same reference, byte-for-byte: the mapper never rebuilds it.
    expect(replayed.content).toBe(providerContent);
  });

  it("maps stop reasons, checking refusal before content", async () => {
    const sdk = new FakeAnthropicSdk([
      textMessage("cut", { stop_reason: "max_tokens" }),
      textMessage("no", { stop_reason: "refusal" }),
      textMessage("plain", { stop_reason: "end_turn" }),
    ]);
    const client = new AnthropicEquipeModelClient({ sdk });
    const base = {
      model: "claude-opus-5-5",
      messages: [{ role: "user" as const, content: "Oi" }],
      effort: "high" as const,
      maxTokens: 16000,
    };
    expect((await client.chat(base)).stopReason).toBe("max_tokens");
    const refused = await client.chat(base);
    expect(refused.stopReason).toBe("refusal");
    expect(refused.content).toBe("no");
    expect((await client.chat(base)).stopReason).toBe("stop");
  });

  it("sends structured output as output_config.format and returns the raw content", async () => {
    const sdk = new FakeAnthropicSdk([
      textMessage(JSON.stringify({ findings: [], summary: "ok" })),
    ]);
    const client = new AnthropicEquipeModelClient({ sdk });
    const response = await client.chat({
      model: "claude-opus-5-5",
      messages: [{ role: "user", content: "Revisa" }],
      output: {
        name: "equipe_text_review",
        schema: z.object({ findings: z.array(z.string()), summary: z.string() }),
      },
      effort: "high",
      maxTokens: 16000,
    });
    const format = sdk.params[0]!.output_config?.format as Record<string, unknown>;
    expect(format?.type).toBe("json_schema");
    expect(format?.schema).toMatchObject({
      type: "object",
      properties: { findings: { type: "array" }, summary: { type: "string" } },
    });
    // The JSON stays a text block: the caller parses it, as before.
    expect(response.content).toBe(JSON.stringify({ findings: [], summary: "ok" }));
    expect(response.providerContent).toEqual([{ type: "text", text: response.content }]);
  });

  it("maps cache reads and writes to their own usage fields, never folded in", async () => {
    const sdk = new FakeAnthropicSdk([
      textMessage("ok", {
        usage: {
          input_tokens: 100,
          output_tokens: 5,
          cache_read_input_tokens: 40,
          cache_creation_input_tokens: 60,
        },
      }),
    ]);
    const client = new AnthropicEquipeModelClient({ sdk });
    const response = await client.chat({
      model: "claude-opus-5-5",
      messages: [{ role: "user", content: "Oi" }],
      effort: "high",
      maxTokens: 16000,
    });
    expect(response.usage).toEqual({
      inputTokens: 100,
      outputTokens: 5,
      cacheReadTokens: 40,
      cacheWriteTokens: 60,
    });
  });

  it("defaults absent cache usage to zero", async () => {
    const sdk = new FakeAnthropicSdk([textMessage("ok")]);
    const client = new AnthropicEquipeModelClient({ sdk });
    const response = await client.chat({
      model: "claude-opus-5-5",
      messages: [{ role: "user", content: "Oi" }],
      effort: "high",
      maxTokens: 16000,
    });
    expect(response.usage).toEqual({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 });
  });

  it("sends top-level cache_control only when the request opts into cache auto", async () => {
    const sdk = new FakeAnthropicSdk([textMessage("a"), textMessage("b")]);
    const client = new AnthropicEquipeModelClient({ sdk });
    const base = {
      model: "claude-opus-5-5",
      messages: [{ role: "user" as const, content: "Oi" }],
      effort: "high" as const,
      maxTokens: 16000,
    };
    await client.chat({ ...base, cache: "auto" });
    await client.chat(base);
    expect(sdk.params[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(sdk.params[1]).not.toHaveProperty("cache_control");
  });

  it("marks the flagged text block as the cache breakpoint", async () => {
    const sdk = new FakeAnthropicSdk([textMessage("ok")]);
    const client = new AnthropicEquipeModelClient({ sdk });
    await client.chat({
      model: "claude-opus-5-5",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "stable context", cacheBreakpoint: true },
            { type: "text", text: "the item" },
          ],
        },
      ],
      effort: "high",
      maxTokens: 16000,
    });
    expect(sdk.params[0]!.messages[0]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "stable context", cache_control: { type: "ephemeral" } },
        { type: "text", text: "the item" },
      ],
    });
  });

  it("refuses to build without a key instead of hitting the network", async () => {
    const client = new AnthropicEquipeModelClient();
    await expect(
      client.chat({ model: "claude-opus-5-5", messages: [] }),
    ).rejects.toThrow("anthropic_api_key_missing");
  });
});
