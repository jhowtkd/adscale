import { describe, it, expect } from "vitest";
import {
  FIDELITY_HARD_FAILURE_CODES,
  assertThresholdsMet,
  capturePassesFactualFidelity,
  computeCreativeValidationAggregate,
  twelveCriteriaPresent,
  type CreativeValidationAfterCapture,
} from "@/server/ai/creative-validation-aggregation";

function criterion(status: "passed" | "warning" | "failed" = "passed") {
  return { status, note: "ok" };
}

function scoreBreakdown(value = 80) {
  return {
    textLegibility: value,
    ctaClarity: value,
    briefMatch: value,
    visualQuality: value,
    formatFit: value,
    variationLevelFit: value,
    informationPreservation: value,
  };
}

function checklist() {
  return {
    legibility: criterion(),
    ctaOffer: criterion(),
    informationPreservation: criterion(),
    briefMatch: criterion(),
    formatFit: criterion(),
    creativeRisk: criterion(),
  };
}

function afterCapture(
  overrides: Partial<CreativeValidationAfterCapture> & { qualityScore: number }
): CreativeValidationAfterCapture {
  return {
    key: "test:art_variation:1:1",
    source: "regenerated",
    path: "app/exports/render-creatives/validation-after/test.png",
    sha256: "abc",
    qualityScore: overrides.qualityScore,
    qualityVerdict: overrides.qualityVerdict ?? "acceptable",
    hardFailures: overrides.hardFailures ?? [],
    qa: { checklist: overrides.qa?.checklist ?? checklist() },
    score: { scoreBreakdown: overrides.score?.scoreBreakdown ?? scoreBreakdown() },
    ...overrides,
  };
}

describe("FIDELITY_HARD_FAILURE_CODES", () => {
  it("matches production gate fidelity-class hard failure codes", () => {
    expect([...FIDELITY_HARD_FAILURE_CODES].sort()).toEqual(
      [
        "campaign_identity_drift",
        "invented_factual_entity",
        "replaced_source_subject",
        "style_reference_contamination",
        "unauthorized_brand_or_ip",
        "unsupported_offer",
        "wrong_brand",
      ].sort()
    );
  });
});

describe("computeCreativeValidationAggregate", () => {
  it("passes meanQualityScore ≥75 when average is 76 across six captures", () => {
    const captures = Array.from({ length: 6 }, (_, i) =>
      afterCapture({ qualityScore: i < 5 ? 76 : 76 })
    );
    const aggregate = computeCreativeValidationAggregate(captures);
    expect(aggregate.meanQualityScore).toBe(76);
    expect(() => assertThresholdsMet(aggregate)).not.toThrow();
  });

  it("fails meanQualityScore when average is 74", () => {
    const captures = Array.from({ length: 6 }, () => afterCapture({ qualityScore: 74 }));
    const aggregate = computeCreativeValidationAggregate(captures);
    expect(aggregate.meanQualityScore).toBe(74);
    expect(() => assertThresholdsMet(aggregate)).toThrow(/meanQualityScore/i);
  });

  it("passes factualFidelityRate when 6/6 captures have no fidelity hard failures", () => {
    const captures = Array.from({ length: 6 }, () => afterCapture({ qualityScore: 80 }));
    const aggregate = computeCreativeValidationAggregate(captures);
    expect(aggregate.factualFidelityRate).toBe(1);
    expect(aggregate.fidelityPassCount).toBe(6);
    expect(() => assertThresholdsMet(aggregate)).not.toThrow();
  });

  it("fails factualFidelityRate when 5/6 pass (0.833 < 0.95)", () => {
    const captures = [
      ...Array.from({ length: 5 }, () => afterCapture({ qualityScore: 80 })),
      afterCapture({
        qualityScore: 90,
        hardFailures: [{ code: "invented_factual_entity", message: "Cantona" }],
      }),
    ];
    const aggregate = computeCreativeValidationAggregate(captures);
    expect(aggregate.factualFidelityRate).toBeCloseTo(5 / 6);
    expect(() => assertThresholdsMet(aggregate)).toThrow(/factualFidelityRate/i);
  });

  it("throws on empty afterCaptures (no divide-by-zero)", () => {
    expect(() => computeCreativeValidationAggregate([])).toThrow(/empty/i);
  });
});

describe("capturePassesFactualFidelity", () => {
  it("fails when invented_factual_entity is present even if qualityScore is 90", () => {
    const capture = afterCapture({
      qualityScore: 90,
      hardFailures: [{ code: "invented_factual_entity", message: "invented person" }],
    });
    expect(capturePassesFactualFidelity(capture)).toBe(false);
  });

  it("passes when only non-fidelity hard failures are present", () => {
    const capture = afterCapture({
      qualityScore: 70,
      hardFailures: [{ code: "visual_overload", message: "busy layout" }],
    });
    expect(capturePassesFactualFidelity(capture)).toBe(true);
  });
});

describe("twelveCriteriaPresent", () => {
  it("returns true when all 6 QA and 7 score keys are present", () => {
    expect(twelveCriteriaPresent(afterCapture({ qualityScore: 80 }))).toBe(true);
  });

  it("returns false when a score breakdown key is missing", () => {
    const capture = afterCapture({ qualityScore: 80 });
    const { variationLevelFit: _removed, ...partial } = capture.score.scoreBreakdown;
    capture.score.scoreBreakdown = partial as typeof capture.score.scoreBreakdown;
    expect(twelveCriteriaPresent(capture)).toBe(false);
  });
});
