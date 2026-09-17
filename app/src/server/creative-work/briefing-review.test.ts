import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreativeWorkFactPack, InferredBriefing } from "./contracts";

const create = vi.hoisted(() => vi.fn());

vi.mock("@/server/ai/utils", () => ({
  getOpenAI: () => ({ chat: { completions: { create } } }),
}));

vi.mock("@/server/validation/env", () => ({
  env: { OPENAI_TEXT_MODEL: "gpt-test" },
}));

import {
  checkInferredBriefing,
  reviewInferredBriefingOnce,
} from "./briefing-review";
import type { DiagnosticEventEnvelope } from "@/server/diagnostics/contract";
import { createDiagnosticContext, withDiagnosticContext } from "@/server/diagnostics/context";
import {
  __setModelCallEventSinkForTests,
  __setModelCallSpanStarterForTests,
} from "@/server/diagnostics/model-calls";

const factPack: CreativeWorkFactPack = {
  version: 1,
  request: "Post para o curso de Psicologia com início em agosto, vagas limitadas.",
  facts: [
    { value: "agosto", class: "date", required: true, origin: "request" },
    { value: "vagas limitadas", class: "condition", required: true, origin: "request" },
  ],
  brand: { requiredElements: [], prohibitedElements: [] },
  identity: { clientProfileId: "profile-1", brandName: "Cenbrap", brandAuthority: "active" },
};

function briefing(overrides: Partial<InferredBriefing> = {}): InferredBriefing {
  return {
    version: 1,
    message: { value: "Curso de Psicologia", state: "sourced" },
    objective: { value: "Apresentar o curso", state: "inferred", confidence: "medium" },
    audience: { value: null, state: "unknown" },
    offer: { value: null, state: "unknown" },
    tone: { value: null, state: "unknown" },
    constraints: { value: null, state: "unknown" },
    readiness: "ready",
    confidence: "medium",
    ...overrides,
  };
}

describe("checkInferredBriefing", () => {
  it("marks missing direction as recoverable", () => {
    const result = checkInferredBriefing(
      briefing({
        message: { value: null, state: "unknown" },
        objective: { value: null, state: "unknown" },
        readiness: "blocked",
      }),
      factPack,
    );

    expect(result).toEqual({
      ok: false,
      findings: [{ code: "missing_direction", recoverable: true }],
    });
  });

  it("rejects an offer that has no authorized origin", () => {
    const result = checkInferredBriefing(
      briefing({ offer: { value: "50% de desconto", state: "inferred", confidence: "low" } }),
      factPack,
    );

    expect(result.findings).toEqual([
      { code: "unsupported_offer", recoverable: true },
    ]);
  });
});

describe("reviewInferredBriefingOnce", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses only the frozen contract and drops an unsupported offer", async () => {
    create.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({
        message: "Curso de Psicologia",
        objective: "Apresentar o curso",
        audience: "Profissionais",
        offer: "50% de desconto",
      }) } }],
    });

    const result = await reviewInferredBriefingOnce({
      briefing: briefing({ readiness: "blocked" }),
      factPack,
      findings: [{ code: "missing_direction", recoverable: true }],
    });

    expect(result).toEqual({
      theme: "Curso de Psicologia",
      objective: "Apresentar o curso",
      audience: "Profissionais",
      offer: null,
    });
    const userPrompt = create.mock.calls[0]?.[0]?.messages?.[1]?.content ?? "";
    expect(userPrompt).toContain(factPack.request);
    expect(userPrompt).toContain("missing_direction");
    expect(userPrompt).not.toContain("50% de desconto");
  });

  it("returns null after a provider or schema failure", async () => {
    create.mockResolvedValueOnce({ choices: [{ message: { content: "not-json" } }] });

    await expect(reviewInferredBriefingOnce({
      briefing: briefing({ readiness: "blocked" }),
      factPack,
      findings: [{ code: "missing_direction", recoverable: true }],
    })).resolves.toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("trace-389: briefing model-call observation", () => {
  let captured: DiagnosticEventEnvelope[];

  beforeEach(() => {
    vi.clearAllMocks();
    captured = [];
    __setModelCallEventSinkForTests((event) => {
      captured.push(event);
    });
    __setModelCallSpanStarterForTests(() => undefined);
  });

  function testContext() {
    return createDiagnosticContext({
      workspaceId: "ws-briefing",
      workItemId: "work-briefing",
      operationId: "op-briefing",
      releaseSha: "test-sha",
      environment: "test",
      process: "web",
      dataOrigin: "test",
    });
  }

  function input() {
    return {
      briefing: briefing({ readiness: "blocked" }),
      factPack,
      findings: [{ code: "missing_direction", recoverable: true }] as const,
    };
  }

  it("observes the briefing revision with requested vs returned model", async () => {
    create.mockResolvedValueOnce({
      model: "gpt-test-2024",
      id: "chatcmpl-brief",
      choices: [{ message: { content: JSON.stringify({
        message: "Curso de Psicologia",
        objective: "Apresentar o curso",
        audience: "Profissionais",
        offer: null,
      }) } }],
    });

    const result = await withDiagnosticContext(testContext(), () =>
      reviewInferredBriefingOnce(input()),
    );

    expect(result).toMatchObject({ theme: "Curso de Psicologia" });
    const completed = captured.filter((event) => event.event === "model.call.completed");
    expect(completed).toHaveLength(1);
    expect(completed[0]!.stage).toBe("briefing");
    expect(completed[0]!.call).toMatchObject({
      provider: "openai",
      requestedModel: "gpt-test",
      returnedModel: "gpt-test-2024",
      providerRequestId: "chatcmpl-brief",
    });
  });

  it("still returns null on invalid JSON while recording transport + validation failure", async () => {
    create.mockResolvedValueOnce({ choices: [{ message: { content: "not-json" } }] });

    const result = await withDiagnosticContext(testContext(), () =>
      reviewInferredBriefingOnce(input()),
    );

    expect(result).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
    expect(captured.filter((event) => event.event === "model.call.completed")).toHaveLength(1);
    const validation = captured.filter((event) => event.event === "model.validation.failed");
    expect(validation).toHaveLength(1);
    expect(validation[0]!.error?.reason).toContain("invalid-json");
    expect(captured.filter((event) => event.event === "model.call.failed")).toHaveLength(0);
  });

  it("records a normalized transport failure when the provider rejects", async () => {
    create.mockRejectedValueOnce(Object.assign(new Error("Rate limit reached"), {
      name: "RateLimitError",
      status: 429,
    }));

    const result = await withDiagnosticContext(testContext(), () =>
      reviewInferredBriefingOnce(input()),
    );

    expect(result).toBeNull();
    const failed = captured.filter((event) => event.event === "model.call.failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.error).toMatchObject({ errorClass: "RateLimitError", status: 429 });
  });
});
