import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Attributes, Span } from "@opentelemetry/api";

import type {
  DiagnosticEventEnvelope,
  DiagnosticStage,
  ModelCallSpec,
} from "./contract";
import { createDiagnosticContext, withDiagnosticContext } from "./context";
import {
  __setModelCallEventSinkForTests,
  __setModelCallSpanStarterForTests,
  newModelCallId,
  normalizeModelCallError,
  observeModelCall,
  reportModelValidationFailed,
  summarizeChatCompletion,
  summarizeImageResult,
  summarizeResponsesApi,
} from "./model-calls";

const SCOPE = {
  workspaceId: "ws-389-modelcalls",
  workItemId: "work-389-modelcalls",
};

function testContext() {
  return createDiagnosticContext({
    ...SCOPE,
    operationId: "op-389-1",
    releaseSha: "test-sha",
    environment: "test",
    process: "web",
    dataOrigin: "test",
  });
}

function spec(overrides?: Partial<ModelCallSpec>): ModelCallSpec {
  return {
    callId: newModelCallId(),
    provider: "openai",
    requestedModel: "gpt-4o-mini",
    stage: "copy",
    ...overrides,
  };
}

function makeSpan() {
  return {
    setAttribute: vi.fn(),
    setAttributes: vi.fn(),
    setStatus: vi.fn(),
    end: vi.fn(),
  };
}

let events: DiagnosticEventEnvelope[];
let spans: Array<{ name: string; attributes?: Attributes; span: ReturnType<typeof makeSpan> }>;

beforeEach(() => {
  events = [];
  spans = [];
  __setModelCallEventSinkForTests((event) => {
    events.push(event);
  });
  __setModelCallSpanStarterForTests((name, attributes) => {
    const span = makeSpan();
    spans.push({ name, attributes, span });
    return span as unknown as Span;
  });
});

function eventsNamed(name: DiagnosticEventEnvelope["event"]) {
  return events.filter((event) => event.event === name);
}

describe("observeModelCall pass-through", () => {
  it("returns the same value and invokes call exactly once", async () => {
    const value = { choices: [] };
    const call = vi.fn().mockResolvedValue(value);
    const seen = await withDiagnosticContext(testContext(), () =>
      observeModelCall(spec(), call, () => ({
        returnedModel: null,
        providerRequestId: null,
      })),
    );
    expect(seen).toBe(value);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("rethrows the identical error after a single invocation", async () => {
    const error = new Error("provider down");
    const call = vi.fn().mockRejectedValue(error);
    await expect(
      withDiagnosticContext(testContext(), () =>
        observeModelCall(spec(), call, () => ({
          returnedModel: null,
          providerRequestId: null,
        })),
      ),
    ).rejects.toBe(error);
    expect(call).toHaveBeenCalledTimes(1);
    expect(eventsNamed("model.call.failed")).toHaveLength(1);
  });

  it("emits nothing and still passes through without ambient context", async () => {
    const value = { ok: true };
    const call = vi.fn().mockResolvedValue(value);
    const seen = await observeModelCall(spec(), call, () => ({
      returnedModel: null,
      providerRequestId: null,
    }));
    expect(seen).toBe(value);
    expect(call).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(0);
    expect(spans).toHaveLength(0);
  });

  it("emits nothing for a foreign (non-single) ambient context", async () => {
    const value = { ok: true };
    const foreign = {
      ...testContext(),
      protocol: "variation",
    } as unknown as ReturnType<typeof testContext>;
    const seen = await withDiagnosticContext(foreign, () =>
      observeModelCall(spec(), () => Promise.resolve(value), () => ({
        returnedModel: null,
        providerRequestId: null,
      })),
    );
    expect(seen).toBe(value);
    expect(events).toHaveLength(0);
  });

  it("passes through without telemetry when the spec is malformed", async () => {
    const value = { ok: true };
    const bad = spec({ callId: "" });
    const seen = await withDiagnosticContext(testContext(), () =>
      observeModelCall(bad, () => Promise.resolve(value), () => ({
        returnedModel: null,
        providerRequestId: null,
      })),
    );
    expect(seen).toBe(value);
    expect(events).toHaveLength(0);
  });
});

describe("observeModelCall transport events", () => {
  it("records requested vs returned provider/model with measured latency", async () => {
    await withDiagnosticContext(testContext(), () =>
      observeModelCall(spec({ requestedModel: "gpt-4o-mini" }), () =>
        Promise.resolve({
          model: "gpt-4o-mini-2024-07-18",
          id: "chatcmpl-123",
          usage: { prompt_tokens: 12, completion_tokens: 34 },
        }), summarizeChatCompletion),
    );
    expect(eventsNamed("model.call.started")).toHaveLength(1);
    const completed = eventsNamed("model.call.completed");
    expect(completed).toHaveLength(1);
    const call = completed[0]!.call!;
    expect(call.provider).toBe("openai");
    expect(call.requestedModel).toBe("gpt-4o-mini");
    expect(call.returnedModel).toBe("gpt-4o-mini-2024-07-18");
    expect(call.providerRequestId).toBe("chatcmpl-123");
    expect(call.inputTokens).toBe(12);
    expect(call.outputTokens).toBe(34);
    expect(call.latencyMs).toEqual(expect.any(Number));
    expect(completed[0]!.durationMs).toEqual(expect.any(Number));
    expect(completed[0]!.stage).toBe("copy");
    expect(completed[0]!.status).toBe("completed");
    expect(completed[0]!.context?.workItemId).toBe(SCOPE.workItemId);
  });

  it("omits usage and request id when the provider did not return them", async () => {
    await withDiagnosticContext(testContext(), () =>
      observeModelCall(spec(), () => Promise.resolve({ model: "gpt-4o-mini" }), summarizeChatCompletion),
    );
    const completed = eventsNamed("model.call.completed");
    expect(completed).toHaveLength(1);
    const call = completed[0]!.call!;
    expect(call.providerRequestId).toBeNull();
    expect("inputTokens" in call).toBe(false);
    expect("outputTokens" in call).toBe(false);
  });

  it("treats a quality verdict payload as completed, never a provider error", async () => {
    const verdict = { findings: [{ code: "unsupported_claim", status: "confirmed" }], summary: "rejected" };
    const seen = await withDiagnosticContext(testContext(), () =>
      observeModelCall(
        spec({ stage: "quality" }),
        () => Promise.resolve(verdict),
        () => ({ returnedModel: "gpt-4o-mini", providerRequestId: null }),
      ),
    );
    expect(seen).toBe(verdict);
    expect(eventsNamed("model.call.completed")).toHaveLength(1);
    expect(eventsNamed("model.call.failed")).toHaveLength(0);
    expect(eventsNamed("model.validation.failed")).toHaveLength(0);
  });

  it("marks timeouts as unknown remote outcome, not proof of no billing", async () => {
    const timeout = Object.assign(new Error("Request timed out."), {
      name: "APIConnectionTimeoutError",
    });
    await expect(
      withDiagnosticContext(testContext(), () =>
        observeModelCall(spec(), () => Promise.reject(timeout), summarizeChatCompletion),
      ),
    ).rejects.toBe(timeout);
    const failed = eventsNamed("model.call.failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.error).toMatchObject({ errorClass: "APIConnectionTimeoutError", status: null });
    expect(failed[0]!.attributes).toMatchObject({ timeout: true, remoteOutcome: "unknown" });
  });

  it("normalizes provider failures with class/status/reason when known", async () => {
    const rateLimited = Object.assign(new Error("Rate limit reached"), {
      name: "RateLimitError",
      status: 429,
    });
    await expect(
      withDiagnosticContext(testContext(), () =>
        observeModelCall(spec(), () => Promise.reject(rateLimited), summarizeChatCompletion),
      ),
    ).rejects.toBe(rateLimited);
    const failed = eventsNamed("model.call.failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.error).toMatchObject({
      errorClass: "RateLimitError",
      status: 429,
      reason: "Rate limit reached",
    });
    expect(failed[0]!.attributes?.["remoteOutcome"]).toBeUndefined();
  });
});

describe("observeModelCall never disturbs generation", () => {
  it("never re-invokes call when summarize throws; records transport + validation failure", async () => {
    const parseError = new SyntaxError("Unexpected token");
    const call = vi.fn().mockResolvedValue({ choices: [] });
    const summarize = vi.fn(() => {
      throw parseError;
    });
    await expect(
      withDiagnosticContext(testContext(), () => observeModelCall(spec(), call, summarize)),
    ).rejects.toBe(parseError);
    expect(call).toHaveBeenCalledTimes(1);
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(eventsNamed("model.call.completed")).toHaveLength(1);
    expect(eventsNamed("model.validation.failed")).toHaveLength(1);
  });

  it("returns the value when the event sink throws", async () => {
    __setModelCallEventSinkForTests(() => {
      throw new Error("journal unavailable");
    });
    const value = { ok: true };
    const call = vi.fn().mockResolvedValue(value);
    const seen = await withDiagnosticContext(testContext(), () =>
      observeModelCall(spec(), call, () => ({
        returnedModel: null,
        providerRequestId: null,
      })),
    );
    expect(seen).toBe(value);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("returns the value when span operations throw", async () => {
    __setModelCallSpanStarterForTests(() => {
      throw new Error("tracer unavailable");
    });
    const value = { ok: true };
    const call = vi.fn().mockResolvedValue(value);
    const seen = await withDiagnosticContext(testContext(), () =>
      observeModelCall(spec(), call, () => ({
        returnedModel: null,
        providerRequestId: null,
      })),
    );
    expect(seen).toBe(value);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("gives every real attempt its own callId while replays emit nothing new", async () => {
    const memo = new Map<string, unknown>();
    async function runStep(key: string, stage: DiagnosticStage) {
      const cached = memo.get(key);
      if (cached !== undefined) return cached;
      const value = await withDiagnosticContext(testContext(), () =>
        observeModelCall(
          { callId: newModelCallId(), provider: "openai", requestedModel: "gpt-4o-mini", stage },
          () => Promise.resolve({ n: events.length }),
          () => ({ returnedModel: null, providerRequestId: null }),
        ),
      );
      memo.set(key, value);
      return value;
    }
    await runStep("qa", "quality");
    await runStep("qa", "quality");
    await runStep("qa-2", "quality");
    const completed = eventsNamed("model.call.completed");
    expect(completed).toHaveLength(2);
    const callIds = completed.map((event) => event.call!.callId);
    expect(new Set(callIds).size).toBe(2);
  });
});

describe("observeModelCall spans", () => {
  it("starts one span per call with business identity and bounded attributes", async () => {
    const callId = newModelCallId();
    await withDiagnosticContext(testContext(), () =>
      observeModelCall(
        spec({ callId, stage: "quality" }),
        () => Promise.resolve({ model: "gpt-4o-mini", id: "resp-1" }),
        summarizeChatCompletion,
      ),
    );
    expect(spans).toHaveLength(1);
    expect(spans[0]!.attributes).toMatchObject({
      "adscale.work_item_id": SCOPE.workItemId,
      "adscale.call_id": callId,
      "adscale.stage": "quality",
      "adscale.provider": "openai",
      "adscale.requested_model": "gpt-4o-mini",
    });
    expect(spans[0]!.span.end).toHaveBeenCalledTimes(1);
  });

  it("ends the span on provider failure without recording exception payloads", async () => {
    await expect(
      withDiagnosticContext(testContext(), () =>
        observeModelCall(spec(), () => Promise.reject(new Error("boom")), summarizeChatCompletion),
      ),
    ).rejects.toThrow("boom");
    expect(spans).toHaveLength(1);
    expect(spans[0]!.span.setStatus).toHaveBeenCalledTimes(1);
    expect(spans[0]!.span.end).toHaveBeenCalledTimes(1);
  });
});

describe("reportModelValidationFailed", () => {
  it("emits model.validation.failed linked to the answered call", async () => {
    const callId = newModelCallId();
    await withDiagnosticContext(testContext(), () =>
      reportModelValidationFailed({
        callId,
        provider: "openai",
        requestedModel: "gpt-4o-mini",
        stage: "copy",
        reason: "invalid-json",
      }),
    );
    const failed = eventsNamed("model.validation.failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.status).toBe("failed");
    expect(failed[0]!.call).toMatchObject({ callId, provider: "openai", requestedModel: "gpt-4o-mini" });
    expect(failed[0]!.error).toMatchObject({ errorClass: "ContentValidationError", status: null });
    expect(failed[0]!.error!.reason).toContain("invalid-json");
  });

  it("is silent without ambient context and never throws", () => {
    expect(() =>
      reportModelValidationFailed({
        callId: "",
        provider: "",
        requestedModel: "",
        stage: "copy",
        reason: "invalid-json",
      }),
    ).not.toThrow();
    expect(events).toHaveLength(0);
  });
});

describe("summarize helpers", () => {
  it("reads chat-completion metadata only when returned", () => {
    expect(
      summarizeChatCompletion({
        model: "gpt-4o-mini-2024-07-18",
        id: "chatcmpl-1",
        usage: { prompt_tokens: 3, completion_tokens: 5 },
      }),
    ).toEqual({
      returnedModel: "gpt-4o-mini-2024-07-18",
      providerRequestId: "chatcmpl-1",
      inputTokens: 3,
      outputTokens: 5,
    });
    expect(summarizeChatCompletion({})).toEqual({
      returnedModel: null,
      providerRequestId: null,
    });
    expect(summarizeChatCompletion(null)).toEqual({
      returnedModel: null,
      providerRequestId: null,
    });
  });

  it("prefers the SDK request id over the response id", () => {
    expect(
      summarizeChatCompletion({ id: "chatcmpl-1", _request_id: "req-9" }),
    ).toMatchObject({ providerRequestId: "req-9" });
  });

  it("reads Responses-API usage without inventing zeros", () => {
    expect(
      summarizeResponsesApi({ model: "gpt-5", usage: { input_tokens: 0, output_tokens: 7 } }),
    ).toEqual({
      returnedModel: "gpt-5",
      providerRequestId: null,
      inputTokens: 0,
      outputTokens: 7,
    });
    expect(summarizeResponsesApi({ model: "gpt-5", usage: {} })).toEqual({
      returnedModel: "gpt-5",
      providerRequestId: null,
    });
  });

  it("leaves the returned image model null when the provider echoes none", () => {
    expect(
      summarizeImageResult({ data: [{ b64_json: "x" }], _request_id: "req-img" }),
    ).toEqual({ returnedModel: null, providerRequestId: "req-img" });
  });
});

describe("normalizeModelCallError", () => {
  it("leaves class/status/reason null when nothing is known", () => {
    expect(normalizeModelCallError(undefined)).toEqual({
      error: { errorClass: null, status: null, reason: null },
      timeout: false,
    });
  });

  it("redacts secrets from reasons and bounds their length", () => {
    const { error } = normalizeModelCallError(
      new Error("failed with Authorization: Bearer sk-secret-value and more text"),
    );
    expect(error.errorClass).toBe("Error");
    expect(error.reason).not.toContain("sk-secret-value");
    const { error: long } = normalizeModelCallError(new Error("x".repeat(10_000)));
    expect(long.reason!.length).toBeLessThanOrEqual(256);
  });
});

describe("newModelCallId", () => {
  it("mints unique non-empty identities", () => {
    const ids = new Set([newModelCallId(), newModelCallId(), newModelCallId()]);
    expect(ids.size).toBe(3);
    for (const id of ids) expect(id.length).toBeGreaterThan(0);
  });
});
