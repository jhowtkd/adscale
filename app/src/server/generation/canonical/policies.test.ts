import { describe, expect, it } from "vitest";
import {
  decideAutoRetry,
  decideCreativeWorkRefund,
  decideDerivationRefund,
  decideGenerationRefund,
  decideJobIdempotency,
  decidePostGenerationQuality,
} from "./policies";
import { GENERATION_CREDIT_COSTS } from "./types";

describe("decideDerivationRefund", () => {
  it("refunds assistant creative_revision on job_failure", () => {
    const decision = decideDerivationRefund({
      surface: "assistant",
      generationMode: "creative_revision",
      assistantActionId: "action-1",
      failurePhase: "job_failure",
    });
    expect(decision).toEqual({
      refund: true,
      amount: GENERATION_CREDIT_COSTS.singleDerivation,
      idempotencyKey: "assistant-action:action-1:refund",
      reason: "assistant_creative_revision_job_failure",
    });
  });

  it("skips refund when refundPolicy is none (goal/triplet)", () => {
    expect(
      decideDerivationRefund({
        surface: "assistant",
        generationMode: "creative_revision",
        assistantActionId: "action-1",
        refundPolicy: "none",
        failurePhase: "job_failure",
      }).refund
    ).toBe(false);
  });

  it("does not refund campaign post_provider or low_quality inside the job", () => {
    expect(
      decideDerivationRefund({
        surface: "campaign",
        generationMode: "art_variation",
        failurePhase: "post_provider",
      }).refund
    ).toBe(false);
    expect(
      decideDerivationRefund({
        surface: "campaign",
        generationMode: "art_variation",
        failurePhase: "low_quality",
      }).refund
    ).toBe(false);
  });
});

describe("decideCreativeWorkRefund", () => {
  it("refunds pre_provider and low_quality at output cost", () => {
    const pre = decideCreativeWorkRefund({
      surface: "quick_tool",
      failurePhase: "pre_provider",
      workItemId: "w1",
      outputId: "o1",
    });
    expect(pre).toMatchObject({
      refund: true,
      amount: 5,
      idempotencyKey: "creative-work:w1:output:o1:pregen-refund",
    });

    const low = decideCreativeWorkRefund({
      surface: "quick_tool",
      failurePhase: "low_quality",
      workItemId: "w1",
      outputId: "o1",
    });
    expect(low.refund).toBe(true);
    if (low.refund) expect(low.reason).toBe("creative_work_low_quality");
  });

  it("does not refund post_provider failures", () => {
    expect(
      decideCreativeWorkRefund({
        surface: "quick_tool",
        failurePhase: "post_provider",
        workItemId: "w1",
        outputId: "o1",
      }).refund
    ).toBe(false);
  });

  it("refunds a worker-level failure when no output can be delivered", () => {
    expect(
      decideCreativeWorkRefund({
        surface: "quick_tool",
        failurePhase: "job_failure",
        workItemId: "w1",
        outputId: "o1",
      })
    ).toEqual({
      refund: true,
      amount: 5,
      idempotencyKey: "creative-work:w1:output:o1:job-refund",
      reason: "creative_work_job_failure",
    });
  });
});

describe("parity: same contract surface decisions", () => {
  it("routes decideGenerationRefund by surface", () => {
    expect(
      decideGenerationRefund({
        surface: "assistant",
        generationMode: "creative_revision",
        assistantActionId: "a1",
        failurePhase: "job_failure",
      }).refund
    ).toBe(true);

    expect(
      decideGenerationRefund({
        surface: "quick_tool",
        failurePhase: "post_provider",
        workItemId: "w",
        outputId: "o",
      }).refund
    ).toBe(false);
  });

  it("idempotency skip is equivalent for completed destinations", () => {
    expect(
      decideJobIdempotency({
        surface: "campaign",
        hasOutputKey: true,
      }).skip
    ).toBe(true);
    expect(
      decideJobIdempotency({
        surface: "quick_tool",
        outputStatus: "completed",
      }).skip
    ).toBe(true);
  });

  it("auto-retry only on derivation when policy says eligible", () => {
    expect(
      decideAutoRetry({
        surface: "campaign",
        eligibleByPolicy: true,
      }).retry
    ).toBe(true);
    expect(
      decideAutoRetry({
        surface: "quick_tool",
        eligibleByPolicy: true,
      }).retry
    ).toBe(false);
  });
});

describe("decidePostGenerationQuality", () => {
  it("rejects Criar Post below threshold and accepts campaign advisory scores", () => {
    expect(
      decidePostGenerationQuality({
        surface: "quick_tool",
        quality: { scoreStatus: "analyzed", qualityScore: 40 },
      }).accept
    ).toBe(false);
    expect(
      decidePostGenerationQuality({
        surface: "campaign",
        quality: { scoreStatus: "analyzed", qualityScore: 40 },
      }).accept
    ).toBe(true);
  });

  it("accepts when score is unavailable on quick_tool", () => {
    expect(
      decidePostGenerationQuality({ surface: "quick_tool", quality: null }).accept
    ).toBe(true);
  });
});
