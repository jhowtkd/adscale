import { describe, expect, it } from "vitest";
import {
  computeOutputLearningConfidence,
  evidenceStrengthWeight,
  resolvePolarityForVariable,
  shouldApproveOutputLearning,
  shouldSupersedeOutputLearning,
  weightedEvidenceCount,
} from "@/server/output-learning/confidence";
import type { OutputLearningEvidenceRef } from "@/server/output-learning/types";

function evidence(
  overrides: Partial<OutputLearningEvidenceRef> = {}
): OutputLearningEvidenceRef {
  return {
    eventId: "event-1",
    campaignId: "camp-1",
    derivationId: "deriv-1",
    action: "approved",
    direction: "positive",
    strength: "strong",
    variableKey: "cta",
    variableValue: "Shop Now",
    polarity: "supporting",
    generationMode: "art_variation",
    format: "1:1",
    reasonCode: null,
    recordedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("output-learning confidence", () => {
  it("weights strong evidence higher than medium", () => {
    expect(evidenceStrengthWeight("strong")).toBeGreaterThan(
      evidenceStrengthWeight("medium")
    );
  });

  it("approves when supporting dominates with medium confidence", () => {
    const supporting = [evidence(), evidence({ strength: "strong" })];
  const contradicting: OutputLearningEvidenceRef[] = [];
    const { confidence } = computeOutputLearningConfidence(supporting, contradicting);
    expect(
      shouldApproveOutputLearning(supporting, contradicting, confidence, "prefer")
    ).toBe(true);
  });

  it("supersedes when contradicting weight meets or exceeds supporting", () => {
    const supporting = [evidence({ strength: "medium" })];
    const contradicting = [
      evidence({ polarity: "contradicting", direction: "negative", strength: "strong" }),
    ];
    expect(shouldSupersedeOutputLearning(supporting, contradicting)).toBe(true);
  });

  it("maps avoid_pattern polarity from negative actions", () => {
    expect(
      resolvePolarityForVariable({
        variableKey: "avoid_pattern",
        direction: "negative",
      })
    ).toBe("supporting");
    expect(
      resolvePolarityForVariable({
        variableKey: "avoid_pattern",
        direction: "positive",
      })
    ).toBe("contradicting");
  });

  it("computes weighted evidence count", () => {
    const items = [evidence({ strength: "strong" }), evidence({ strength: "medium" })];
    expect(weightedEvidenceCount(items)).toBeCloseTo(1.6);
  });
});
