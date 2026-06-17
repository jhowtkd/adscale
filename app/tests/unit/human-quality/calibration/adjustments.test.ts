import { describe, it, expect } from "vitest";

import { proposeAdjustments } from "@/server/human-quality/calibration/adjustments";
import { buildCompositeSliceKey } from "@/server/human-quality/calibration/aggregate";
import type { CalibrationComparison } from "@/server/human-quality/calibration/types";

function makeComparison(
  overrides: Partial<CalibrationComparison> & {
    id?: string;
    scoreDelta?: number;
  } = {}
): CalibrationComparison {
  const { id, ...rest } = overrides;
  return {
    corpusItemId: id ?? "item-default",
    derivationId: "deriv-1",
    generationMode: "art_variation",
    format: "1:1",
    cohort: "baseline",
    automaticQualityScore: 80,
    humanVisualScore: 62,
    scoreDelta: 18,
    absError: 18,
    primaryFailureReason: "visual_overload",
    factualPass: true,
    qualityVerdict: "pass",
    hardFailureCodes: ["visual_overload"],
    ...rest,
  };
}

describe("proposeAdjustments", () => {
  it("generates proposed adjustment when composite slice count=3 and meanSignedDelta=18", () => {
    const comparisons = [
      makeComparison({ id: "item-1", scoreDelta: 20 }),
      makeComparison({ id: "item-2", scoreDelta: 17 }),
      makeComparison({ id: "item-3", scoreDelta: 17 }),
    ];

    const proposals = proposeAdjustments(comparisons);

    expect(proposals).toHaveLength(1);
    expect(proposals[0].status).toBe("proposed");
    expect(proposals[0].adjustmentVersion).toBe("1.0.0");
    expect(proposals[0].targetModule).toBe("score_ceiling");
    expect(proposals[0].targetKey).toBe("visual_overload");
    expect(proposals[0].sliceKey).toBe(
      buildCompositeSliceKey("visual_overload", "art_variation", "1:1")
    );
    expect(proposals[0].evidenceRefs.corpusItemIds).toEqual([
      "item-1",
      "item-2",
      "item-3",
    ]);
    expect(proposals[0].evidenceRefs.sliceStats.meanSignedDelta).toBe(18);
    expect(proposals[0].evidenceRefs.itemRefs).toHaveLength(3);
    expect(proposals[0].evidenceRefs.itemRefs[0]).toEqual({
      corpusItemId: "item-1",
      scoreDelta: 20,
    });
  });

  it("does not propose when composite slice count=2 (below MIN_SLICE_SAMPLE)", () => {
    const comparisons = [
      makeComparison({ id: "item-1", scoreDelta: 20 }),
      makeComparison({ id: "item-2", scoreDelta: 16 }),
    ];

    const proposals = proposeAdjustments(comparisons);

    expect(proposals).toEqual([]);
  });

  it("does not propose when count=5 but meanSignedDelta=10 (below threshold)", () => {
    const comparisons = Array.from({ length: 5 }, (_, index) =>
      makeComparison({
        id: `item-${index + 1}`,
        scoreDelta: 10,
      })
    );

    const proposals = proposeAdjustments(comparisons);

    expect(proposals).toEqual([]);
  });

  it("targets factual bucket for factual_issue slices without score_ceiling proposals", () => {
    const comparisons = Array.from({ length: 3 }, (_, index) =>
      makeComparison({
        id: `fact-${index + 1}`,
        primaryFailureReason: "factual_issue",
        scoreDelta: -20,
        hardFailureCodes: ["invented_factual_entity"],
        factualPass: false,
      })
    );

    const proposals = proposeAdjustments(comparisons);

    expect(proposals).toHaveLength(1);
    expect(proposals[0].targetModule).toBe("gate_classifier");
    expect(proposals[0].targetModule).not.toBe("score_ceiling");
  });

  it("does not auto-propose for other failure reason", () => {
    const comparisons = Array.from({ length: 3 }, (_, index) =>
      makeComparison({
        id: `other-${index + 1}`,
        primaryFailureReason: "other",
        scoreDelta: 25,
      })
    );

    const proposals = proposeAdjustments(comparisons);

    expect(proposals).toEqual([]);
  });

  it("groups by composite slice key failureReason×mode×format", () => {
    const comparisons = [
      ...Array.from({ length: 3 }, (_, index) =>
        makeComparison({
          id: `vo-${index + 1}`,
          primaryFailureReason: "visual_overload",
          generationMode: "art_variation",
          format: "1:1",
          scoreDelta: 18,
        })
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        makeComparison({
          id: `wh-${index + 1}`,
          primaryFailureReason: "weak_hierarchy",
          generationMode: "restyling",
          format: "9:16",
          scoreDelta: -18,
        })
      ),
    ];

    const proposals = proposeAdjustments(comparisons);

    expect(proposals).toHaveLength(2);
    expect(proposals.map((p) => p.sliceKey).sort()).toEqual(
      [
        buildCompositeSliceKey("visual_overload", "art_variation", "1:1"),
        buildCompositeSliceKey("weak_hierarchy", "restyling", "9:16"),
      ].sort()
    );
  });
});
