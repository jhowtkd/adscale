// Chat Completions clients: OpenAI mapping and the Meta client (#588).
//
// Fakes stand in for the OpenAI SDK surface (no network); error cases use
// the SDK's own typed errors.

import OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createMetaSdk,
  META_MODEL_API_BASE_URL,
  MetaEquipeModelClient,
  OpenAIEquipeModelClient,
  type ModelCallRequest,
} from "./model-client";

const outputSchema = z.object({ answer: z.string() });

function chatResponse(overrides: Record<string, unknown> = {}) {
  return {
    choices: [
      {
        message: { content: "Olá", tool_calls: undefined },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
    ...overrides,
  };
}

/** Fake for the `chat.completions.create` SDK surface. */
function fakeCompletions(script: Array<unknown | Error>) {
  const params: unknown[] = [];
  return {
    params,
    sdk: {
      chat: {
        completions: {
          create: async (request: unknown) => {
            params.push(request);
            const next = script.shift();
            if (next instanceof Error) throw next;
            if (next === undefined) throw new Error("fakeCompletionsOutOfResponses");
            return next;
          },
        },
      },
    } as unknown as OpenAI,
  };
}

function rateLimitError() {
  return new OpenAI.APIError(429, {}, "rate limited", undefined);
}

function serverError() {
  return new OpenAI.APIError(500, {}, "server error", undefined);
}

function badRequestError() {
  return new OpenAI.APIError(400, {}, "bad request", undefined);
}

describe("OpenAIEquipeModelClient", () => {
  it("maps structured output to response_format and ignores effort", async () => {
    const { params, sdk } = fakeCompletions([chatResponse()]);
    const client = new OpenAIEquipeModelClient(sdk);
    const response = await client.chat({
      model: "gpt-5.6-sol",
      messages: [{ role: "user", content: "Oi" }],
      output: { name: "test_output", schema: outputSchema },
      effort: "high",
      maxTokens: 100,
    });
    expect(response).toMatchObject({
      content: "Olá",
      toolCalls: [],
      usage: { inputTokens: 10, outputTokens: 5 },
      stopReason: "stop",
    });
    expect(params).toHaveLength(1);
    const sent = params[0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty("reasoning_effort");
    expect(sent).toMatchObject({
      model: "gpt-5.6-sol",
      max_completion_tokens: 100,
      response_format: {
        type: "json_schema",
        json_schema: { name: "test_output" },
      },
    });
  });

  it("subtracts cached tokens from input so they are never double-counted", async () => {
    const { sdk } = fakeCompletions([
      chatResponse({
        usage: { prompt_tokens: 100, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 30 } },
      }),
      chatResponse(),
    ]);
    const client = new OpenAIEquipeModelClient(sdk);
    const base: ModelCallRequest = { model: "gpt-5.6-sol", messages: [] };
    expect((await client.chat(base)).usage).toEqual({
      inputTokens: 70,
      outputTokens: 5,
      cacheReadTokens: 30,
      cacheWriteTokens: 0,
    });
    expect((await client.chat(base)).usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  });

  it("ignores the Anthropic cache hints: strips breakpoints, drops auto", async () => {
    const { params, sdk } = fakeCompletions([chatResponse()]);
    const client = new OpenAIEquipeModelClient(sdk);
    await client.chat({
      model: "gpt-5.6-sol",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "stable", cacheBreakpoint: true },
            { type: "text", text: "item" },
          ],
        },
      ],
      cache: "auto",
    });
    const sent = params[0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty("cache");
    expect(sent).not.toHaveProperty("cache_control");
    expect(sent.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "stable" },
          { type: "text", text: "item" },
        ],
      },
    ]);
  });

  it("maps tools and tool_calls plus stop reasons", async () => {
    const { sdk } = fakeCompletions([
      chatResponse({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: "call-1", type: "function", function: { name: "get_goals", arguments: "{}" } },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      }),
      chatResponse({ choices: [{ message: { content: "cut" }, finish_reason: "length" }] }),
      chatResponse({ choices: [{ message: { content: null }, finish_reason: "content_filter" }] }),
    ]);
    const client = new OpenAIEquipeModelClient(sdk);
    const base: ModelCallRequest = { model: "gpt-5.6-sol", messages: [] };
    const tools = await client.chat({ ...base, tools: [{ name: "get_goals", description: "g", parameters: {} }] });
    expect(tools.stopReason).toBe("tool_calls");
    expect(tools.toolCalls).toEqual([{ id: "call-1", name: "get_goals", argumentsJson: "{}" }]);
    expect((await client.chat(base)).stopReason).toBe("max_tokens");
    expect((await client.chat(base)).stopReason).toBe("refusal");
  });
});

describe("createMetaSdk", () => {
  it("points at the Meta Model API with the given key and no SDK retries", () => {
    const sdk = createMetaSdk("meta-test-key");
    expect(sdk.baseURL).toBe(META_MODEL_API_BASE_URL);
    expect(sdk.baseURL).toBe("https://api.meta.ai/v1");
    expect(sdk.apiKey).toBe("meta-test-key");
    expect(sdk.maxRetries).toBe(0);
  });
});

describe("MetaEquipeModelClient", () => {
  it("sends reasoning_effort and the shared mapping", async () => {
    const { params, sdk } = fakeCompletions([chatResponse()]);
    const client = new MetaEquipeModelClient({ client: sdk });
    await client.chat({
      model: "muse-spark-1.3-contributor",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "Oi" },
      ],
      tools: [{ name: "get_goals", description: "g", parameters: { type: "object" } }],
      output: { name: "equipe_research", schema: outputSchema },
      effort: "xhigh",
      maxTokens: 16000,
    });
    const sent = params[0] as Record<string, unknown>;
    expect(sent).toMatchObject({
      model: "muse-spark-1.3-contributor",
      reasoning_effort: "xhigh",
      max_completion_tokens: 16000,
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "Oi" },
      ],
      tools: [
        { type: "function", function: { name: "get_goals", description: "g" } },
      ],
      response_format: { type: "json_schema", json_schema: { name: "equipe_research" } },
    });
  });

  it("defaults an unset effort to medium and never sends none", async () => {
    const { params, sdk } = fakeCompletions([chatResponse(), chatResponse()]);
    const client = new MetaEquipeModelClient({ client: sdk });
    await client.chat({ model: "muse-spark-1.3", messages: [] });
    await client.chat({ model: "muse-spark-1.3", messages: [], effort: "max" });
    expect((params[0] as Record<string, unknown>).reasoning_effort).toBe("medium");
    expect((params[1] as Record<string, unknown>).reasoning_effort).toBe("max");
    for (const sent of params) {
      expect((sent as Record<string, unknown>).reasoning_effort).not.toBe("none");
    }
  });

  it("reports Meta cached tokens separately from uncached input", async () => {
    const { sdk } = fakeCompletions([
      chatResponse({
        usage: { prompt_tokens: 1000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 800 } },
      }),
    ]);
    const client = new MetaEquipeModelClient({ client: sdk });
    const response = await client.chat({ model: "muse-spark-1.3-contributor", messages: [] });
    expect(response.usage).toEqual({
      inputTokens: 200,
      outputTokens: 50,
      cacheReadTokens: 800,
      cacheWriteTokens: 0,
    });
  });

  it("retries 429 and 5xx with backoff, then succeeds", async () => {
    const { params, sdk } = fakeCompletions([rateLimitError(), serverError(), chatResponse()]);
    const slept: number[] = [];
    const client = new MetaEquipeModelClient({ client: sdk, sleep: async (ms) => void slept.push(ms) });
    const response = await client.chat({ model: "muse-spark-1.3-contributor", messages: [] });
    expect(response.content).toBe("Olá");
    expect(params).toHaveLength(3);
    expect(slept).toHaveLength(2);
    // 500ms doubling plus small jitter.
    expect(slept[0]).toBeGreaterThanOrEqual(500);
    expect(slept[0]).toBeLessThan(750);
    expect(slept[1]).toBeGreaterThanOrEqual(1000);
    expect(slept[1]).toBeLessThan(1250);
  });

  it("gives up after 4 attempts and never retries 4xx", async () => {
    const failing = fakeCompletions([rateLimitError(), rateLimitError(), rateLimitError(), rateLimitError(), chatResponse()]);
    const slept: number[] = [];
    const client = new MetaEquipeModelClient({
      client: failing.sdk,
      sleep: async (ms) => void slept.push(ms),
    });
    await expect(client.chat({ model: "muse-spark-1.3-contributor", messages: [] })).rejects.toBeInstanceOf(
      OpenAI.APIError,
    );
    expect(failing.params).toHaveLength(4);
    expect(slept).toHaveLength(3);

    const bad = fakeCompletions([badRequestError()]);
    await expect(
      new MetaEquipeModelClient({ client: bad.sdk }).chat({ model: "muse-spark-1.3", messages: [] }),
    ).rejects.toBeInstanceOf(OpenAI.APIError);
    expect(bad.params).toHaveLength(1);
  });

  it("refuses to build without a key instead of hitting the network", async () => {
    const client = new MetaEquipeModelClient();
    await expect(client.chat({ model: "muse-spark-1.3", messages: [] })).rejects.toThrow(
      "meta_model_api_key_missing",
    );
  });
});

describe("noRetries (free-account single attempt)", () => {
  function recordingSdk(script: Array<unknown | Error>) {
    const options: unknown[] = [];
    const calls: unknown[] = [];
    const sdk = { chat: { completions: { create: async (request: unknown, opts?: unknown) => {
      calls.push(request); options.push(opts);
      const next = script.shift();
      if (next instanceof Error) throw next;
      return next;
    } } } } as unknown as OpenAI;
    return { sdk, options, calls };
  }

  it("OpenAI passes maxRetries 0 only when noRetries is set", async () => {
    const rec = recordingSdk([chatResponse(), chatResponse()]);
    const client = new OpenAIEquipeModelClient(rec.sdk);
    await client.chat({ model: "gpt-5.6-sol", messages: [], noRetries: true });
    await client.chat({ model: "gpt-5.6-sol", messages: [] });
    expect(rec.options).toEqual([{ maxRetries: 0 }, undefined]);
  });

  it("Meta makes exactly one attempt on a retryable 429/5xx and never sleeps", async () => {
    for (const failure of [rateLimitError(), serverError()]) {
      const rec = recordingSdk([failure, chatResponse()]);
      const slept: number[] = [];
      const client = new MetaEquipeModelClient({ client: rec.sdk, sleep: async (ms) => void slept.push(ms) });
      await expect(client.chat({ model: "muse-spark-1.3-contributor", messages: [], noRetries: true }))
        .rejects.toBeInstanceOf(OpenAI.APIError);
      expect(rec.calls).toHaveLength(1);
      expect(slept).toEqual([]);
    }
  });
});

describe("usageKnown", () => {
  it("is false when the provider omits usage (free reservation must stay at its maximum) and true otherwise", async () => {
    const missing = fakeCompletions([chatResponse({ usage: undefined })]);
    expect((await new OpenAIEquipeModelClient(missing.sdk).chat({ model: "gpt-5.6-sol", messages: [] })).usageKnown).toBe(false);
    const metaMissing = fakeCompletions([chatResponse({ usage: undefined })]);
    expect((await new MetaEquipeModelClient({ client: metaMissing.sdk }).chat({ model: "muse-spark-1.3", messages: [] })).usageKnown).toBe(false);
    const present = fakeCompletions([chatResponse()]);
    expect((await new OpenAIEquipeModelClient(present.sdk).chat({ model: "gpt-5.6-sol", messages: [] })).usageKnown).toBe(true);
  });
});
