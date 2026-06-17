import { describe, it, expect } from "vitest";
import {
  resolveGateTargets,
  detectHumanGateMismatch,
} from "@/server/human-quality/calibration/failure-bridge";
import type { CalibrationComparison } from "@/server/human-quality/calibration/types";
import { FIDELITY_HARD_FAILURE_CODES } from "@/server/ai/creative-validation-aggregation";

function makeComparison(
  overrides: Partial<CalibrationComparison> = {}
): CalibrationComparison {
  return {
    corpusItemId: "item-1",
    derivationId: "deriv-1",
    generationMode: "art_variation",
    format: "1:1",
    cohort: "baseline",
    automaticQualityScore: 70,
    humanVisualScore: 60,
    scoreDelta: 10,
    absError: 10,
    primaryFailureReason: "visual_overload",
    factualPass: true,
    qualityVerdict: "pass",
    hardFailureCodes: [],
    ...overrides,
  };
}

describe("resolveGateTargets", () => {
  it("maps visual_overload to gate codes including visual_overload", () => {
    const targets = resolveGateTargets("visual_overload");

    expect(targets).toContain("visual_overload");
    expect(targets).toContain("VISUAL_OVERLOAD_RUBRIC");
  });

  it("maps factual_issue only to FIDELITY_HARD_FAILURE_CODES targets", () => {
    const targets = resolveGateTargets("factual_issue");
    const fidelityCodes = [...FIDELITY_HARD_FAILURE_CODES];

    expect(targets.sort()).toEqual(fidelityCodes.sort());
    expect(targets).not.toContain("visual_overload");
    expect(targets).not.toContain("VISUAL_OVERLOAD_RUBRIC");
  });

  it("returns empty targets for other (report-only)", () => {
    expect(resolveGateTargets("other")).toEqual([]);
  });

  it("maps weak_hierarchy to dominant-idea gate targets", () => {
    const targets = resolveGateTargets("weak_hierarchy");

    expect(targets).toContain("missing_dominant_idea");
    expect(targets).toContain("MISSING_DOMINANT_IDEA_MARKERS");
  });
});

describe("detectHumanGateMismatch", () => {
  it("flags mismatch when human cites factual_issue without fidelity codes in snapshot", () => {
    const mismatch = detectHumanGateMismatch(
      makeComparison({
        primaryFailureReason: "factual_issue",
        hardFailureCodes: ["visual_overload"],
      })
    );

    expect(mismatch).toBe(true);
  });

  it("does not flag when snapshot includes a fidelity hard-failure code", () => {
    const mismatch = detectHumanGateMismatch(
      makeComparison({
        primaryFailureReason: "factual_issue",
        hardFailureCodes: ["invented_factual_entity"],
      })
    );

    expect(mismatch).toBe(false);
  });

  it("does not flag non-factual human failure reasons", () => {
    expect(
      detectHumanGateMismatch(
        makeComparison({
          primaryFailureReason: "visual_overload",
          hardFailureCodes: [],
        })
      )
    ).toBe(false);
  });
});
