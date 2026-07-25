import { describe, expect, it } from "vitest";
import {
  categorizeCreativeWorkFailure,
  creativeWorkRefetchInterval,
  extractCreativeWorkBrandConflict,
  getCreativeWorkEvaluatorSummary,
  getCreativeWorkObjectiveVerdict,
  isCreativeWorkRetryEligible,
  CreativeWorkRequestError,
} from "./use-creative-work";

describe("creativeWorkRefetchInterval (R-008: 202 + polling contract)", () => {
  it("polls while the work is generating", () => {
    expect(
      creativeWorkRefetchInterval({ work: { status: "generating" }, outputs: [] }),
    ).toBe(2000);
  });

  it("polls while any output is queued or processing (partial batch)", () => {
    expect(
      creativeWorkRefetchInterval({
        work: { status: "partial" },
        outputs: [{ status: "completed" }, { status: "processing" }, { status: "failed" }],
      }),
    ).toBe(2000);
    expect(
      creativeWorkRefetchInterval({
        work: { status: "partial" },
        outputs: [{ status: "completed" }, { status: "queued" }],
      }),
    ).toBe(2000);
  });

  it("polls while any source is uploaded or analyzing", () => {
    expect(
      creativeWorkRefetchInterval({
        work: { status: "draft" },
        outputs: [],
        sources: [{ status: "analyzing" }],
      } as never),
    ).toBe(2000);
  });

  it("stops once every output reaches a terminal state", () => {
    expect(
      creativeWorkRefetchInterval({
        work: { status: "completed" },
        outputs: [{ status: "completed" }, { status: "failed" }],
      }),
    ).toBe(false);
    expect(creativeWorkRefetchInterval(undefined)).toBe(false);
  });
});

describe("categorizeCreativeWorkFailure (R-008: stable typed categories)", () => {
  it.each([
    ["generation_timeout", "timeout"],
    ["provider_timeout", "timeout"],
    ["openai_image_edit_timed_out", "timeout"],
    ["invalid_context", "invalid_context"],
    ["factual_violation", "factual_violation"],
    ["brand_conflict", "brand_conflict"],
    ["reference_failure", "reference_failure"],
    ["image_call_budget_exhausted", "unknown"],
    ["low_quality", "unknown"],
    ["auto_retry_dispatch_failed", "unknown"],
    ["some_sanitized_slug", "unknown"],
    [null, "unknown"],
    [undefined, "unknown"],
  ] as const)("maps %s → %s", (code, category) => {
    expect(categorizeCreativeWorkFailure(code)).toBe(category);
  });
});

describe("isCreativeWorkRetryEligible (R-006: durable budget authority)", () => {
  it("allows a failed initial output with budget left", () => {
    expect(
      isCreativeWorkRetryEligible({ status: "failed", parentOutputId: null, imageCallCount: 1 }),
    ).toBe(true);
    // Legacy rows without the counter default to budget available.
    expect(
      isCreativeWorkRetryEligible({ status: "failed", parentOutputId: null, imageCallCount: undefined }),
    ).toBe(true);
  });

  it("denies the retry when the durable budget is exhausted", () => {
    expect(
      isCreativeWorkRetryEligible({ status: "failed", parentOutputId: null, imageCallCount: 2 }),
    ).toBe(false);
  });

  it("denies non-failed outputs and revisions (paid command path)", () => {
    expect(
      isCreativeWorkRetryEligible({ status: "completed", parentOutputId: null, imageCallCount: 1 }),
    ).toBe(false);
    expect(
      isCreativeWorkRetryEligible({ status: "failed", parentOutputId: "parent-1", imageCallCount: 1 }),
    ).toBe(false);
  });
});

describe("tri-state quality projection (R-005/R-008)", () => {
  it("reads pass/fail/inconclusive only from v1 payloads", () => {
    expect(getCreativeWorkObjectiveVerdict({ schemaVersion: 1, objectiveVerdict: "pass" })).toBe("pass");
    expect(getCreativeWorkObjectiveVerdict({ schemaVersion: 1, objectiveVerdict: "fail" })).toBe("fail");
    expect(getCreativeWorkObjectiveVerdict({ schemaVersion: 1, objectiveVerdict: "inconclusive" })).toBe("inconclusive");
  });

  it("treats legacy score shapes and junk as no verdict", () => {
    expect(getCreativeWorkObjectiveVerdict(null)).toBeNull();
    expect(getCreativeWorkObjectiveVerdict({ scoreStatus: "analyzed", qualityScore: 80 })).toBeNull();
    expect(getCreativeWorkObjectiveVerdict({ schemaVersion: 2, objectiveVerdict: "fail" })).toBeNull();
    expect(getCreativeWorkObjectiveVerdict({ schemaVersion: 1, objectiveVerdict: "maybe" })).toBeNull();
  });

  it("exposes the evaluator summary only for v1 payloads with text", () => {
    expect(
      getCreativeWorkEvaluatorSummary({ schemaVersion: 1, evaluatorSummary: "Avaliador indisponível." }),
    ).toBe("Avaliador indisponível.");
    expect(getCreativeWorkEvaluatorSummary({ schemaVersion: 1, evaluatorSummary: "  " })).toBeNull();
    expect(getCreativeWorkEvaluatorSummary({ schemaVersion: 1, evaluatorSummary: null })).toBeNull();
    expect(getCreativeWorkEvaluatorSummary({ scoreStatus: "analyzed" })).toBeNull();
  });
});

describe("extractCreativeWorkBrandConflict (R-003/R-008)", () => {
  it("extracts the typed 422 payload from a request error", () => {
    const error = new CreativeWorkRequestError("Conflito de marca", "brand_conflict", 422, {
      detectedBrand: "XTB",
      activeBrand: "NR1",
      sourceId: "src-1",
      choices: ["source", "active"],
    });
    expect(extractCreativeWorkBrandConflict(error)).toEqual({
      detectedBrand: "XTB",
      activeBrand: "NR1",
      sourceId: "src-1",
      choices: ["source", "active"],
    });
  });

  it("ignores other codes, non-errors and malformed details", () => {
    expect(
      extractCreativeWorkBrandConflict(new CreativeWorkRequestError("x", "invalid_context", 422, { violations: [] })),
    ).toBeNull();
    expect(extractCreativeWorkBrandConflict(new Error("brand_conflict"))).toBeNull();
    expect(
      extractCreativeWorkBrandConflict(new CreativeWorkRequestError("x", "brand_conflict", 422, { wrong: true })),
    ).toBeNull();
  });
});
