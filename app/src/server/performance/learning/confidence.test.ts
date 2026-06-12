import { describe, expect, it } from "vitest";
import { computeLearningConfidence, shouldApproveLearning } from "./confidence";
import type { LearningEvidenceRef } from "./types";

function evidence(polarity: "supporting" | "contradicting"): LearningEvidenceRef {
  return {
    comparisonId: crypto.randomUUID(),
    hypothesisId: "hyp-1",
    campaignId: "camp-1",
    derivationId: "der-1",
    variableKey: "cta",
    variableValue: "Comprar",
    polarity,
    outcome: polarity === "supporting" ? "supported" : "contradicted",
    verdict: "winner",
    primaryMetric: "ctr",
    impressions: 2000,
    platform: "meta",
    objective: "conversions",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    recordedAt: "2026-06-01T00:00:00.000Z",
  };
}

describe("computeLearningConfidence", () => {
  it("returns low confidence when there is no supporting evidence", () => {
    expect(computeLearningConfidence([], [evidence("contradicting")])).toEqual({
      confidence: "low",
      confidenceScore: "0.0000",
    });
  });

  it("returns higher confidence with more supporting evidence and impressions", () => {
    const result = computeLearningConfidence(
      [evidence("supporting"), evidence("supporting"), evidence("supporting")],
      []
    );
    expect(result.confidence).toBe("high");
    expect(Number(result.confidenceScore)).toBeGreaterThan(0.6);
  });
});

describe("shouldApproveLearning", () => {
  it("requires more supporting than contradicting evidence", () => {
    expect(
      shouldApproveLearning([evidence("supporting")], [evidence("contradicting")], "medium")
    ).toBe(false);
    expect(
      shouldApproveLearning(
        [evidence("supporting"), evidence("supporting")],
        [evidence("contradicting")],
        "medium"
      )
    ).toBe(true);
  });
});
