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
