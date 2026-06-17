import { describe, it, expect } from "vitest";
import {
  buildComparison,
  buildCalibrationComparisons,
  DIVERGENCE_FLAG_THRESHOLD,
} from "@/server/human-quality/calibration/compare";
import type { EvaluatedCorpusRow } from "@/server/human-quality/calibration/types";
import type { HumanQualityCorpusItem, HumanQualityEvaluation } from "@/server/db/schema";

function makeItem(overrides: Partial<HumanQualityCorpusItem> = {}): HumanQualityCorpusItem {
  return {
    id: "item-1",
    workspaceId: "ws-1",
    clientProfileId: "profile-1",
    campaignId: "camp-1",
    derivationId: "deriv-1",
    generationMode: "art_variation",
    format: "1:1",
    cohort: "baseline",
    corpusVersion: 1,
    artifactRef: { derivationId: "deriv-1" },
    qualitySnapshot: { qualityScore: 80, qualityVerdict: "pass" },
    selectedByUserId: "user-1",
    selectedAt: new Date("2026-06-01"),
    status: "evaluated",
    createdAt: new Date("2026-06-01"),
    updatedAt: new Date("2026-06-01"),
    ...overrides,
  };
}

function makeEvaluation(
  overrides: Partial<HumanQualityEvaluation> = {}
): HumanQualityEvaluation {
  return {
    id: "eval-1",
    workspaceId: "ws-1",
    corpusItemId: "item-1",
    reviewerUserId: "reviewer-1",
    visualScore: 65,
    factualPass: true,
    intent: "approve",
    primaryFailureReason: "visual_overload",
    otherReasonText: null,
    notes: null,
    createdAt: new Date("2026-06-02"),
    ...overrides,
  };
}

describe("buildComparison", () => {
  it("computes scoreDelta and absError when automatic score is present", () => {
    const comparison = buildComparison(makeItem(), makeEvaluation({ visualScore: 65 }));

    expect(comparison.automaticQualityScore).toBe(80);
    expect(comparison.humanVisualScore).toBe(65);
    expect(comparison.scoreDelta).toBe(15);
    expect(comparison.absError).toBe(15);
  });

  it("returns null scoreDelta and absError when automatic score is missing", () => {
    const comparison = buildComparison(
      makeItem({ qualitySnapshot: { qualityScore: null } }),
      makeEvaluation({ visualScore: 70 })
    );

    expect(comparison.automaticQualityScore).toBeNull();
    expect(comparison.scoreDelta).toBeNull();
    expect(comparison.absError).toBeNull();
  });

  it("reads qualityScore only from frozen qualitySnapshot", () => {
    const comparison = buildComparison(
      makeItem({
        qualitySnapshot: {
          qualityScore: 72,
          hardFailures: [{ code: "visual_overload", message: "too busy" }],
        },
      }),
      makeEvaluation()
    );

    expect(comparison.automaticQualityScore).toBe(72);
    expect(comparison.hardFailureCodes).toEqual(["visual_overload"]);
    expect(comparison.qualityVerdict).toBeNull();
  });

  it("positive scoreDelta means auto over-scores relative to human", () => {
    const comparison = buildComparison(
      makeItem({ qualitySnapshot: { qualityScore: 90 } }),
      makeEvaluation({ visualScore: 70 })
    );

    expect(comparison.scoreDelta).toBe(20);
  });
});

describe("buildCalibrationComparisons", () => {
  it("maps joined rows preserving slice metadata", () => {
    const rows: EvaluatedCorpusRow[] = [
      {
        item: makeItem({
          id: "item-a",
          generationMode: "restyling",
          format: "9:16",
          cohort: "post_learning",
        }),
        evaluation: makeEvaluation({
          corpusItemId: "item-a",
          visualScore: 55,
          factualPass: false,
          primaryFailureReason: "factual_issue",
        }),
      },
    ];

    const comparisons = buildCalibrationComparisons(rows);

    expect(comparisons).toHaveLength(1);
    expect(comparisons[0]).toMatchObject({
      corpusItemId: "item-a",
      generationMode: "restyling",
      format: "9:16",
      cohort: "post_learning",
      factualPass: false,
      primaryFailureReason: "factual_issue",
    });
  });
});

describe("DIVERGENCE_FLAG_THRESHOLD", () => {
  it("is 15 for downstream divergence flagging", () => {
    expect(DIVERGENCE_FLAG_THRESHOLD).toBe(15);
  });
});
