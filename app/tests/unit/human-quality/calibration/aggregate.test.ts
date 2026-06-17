import { describe, it, expect } from "vitest";
import type { CalibrationComparison } from "@/server/human-quality/calibration/types";
import {
  aggregateGroup,
  groupComparisonsBy,
  buildCompositeSliceKey,
} from "@/server/human-quality/calibration/aggregate";
import { DIVERGENCE_FLAG_THRESHOLD } from "@/server/human-quality/calibration/compare";

function makeComparison(
  overrides: Partial<CalibrationComparison> = {}
): CalibrationComparison {
  return {
    corpusItemId: "item-1",
    derivationId: "deriv-1",
    generationMode: "art_variation",
    format: "1:1",
    cohort: "baseline",
    automaticQualityScore: 80,
    humanVisualScore: 65,
    scoreDelta: 15,
    absError: 15,
    primaryFailureReason: "visual_overload",
    factualPass: true,
    qualityVerdict: "pass",
    hardFailureCodes: [],
    ...overrides,
  };
}

describe("aggregateGroup", () => {
  it("computes count, meanSignedDelta, meanAbsError, overScoreCount and underScoreCount", () => {
    const comparisons = [
      makeComparison({ scoreDelta: 20, absError: 20 }),
      makeComparison({ corpusItemId: "item-2", scoreDelta: -10, absError: 10 }),
      makeComparison({ corpusItemId: "item-3", scoreDelta: 5, absError: 5 }),
    ];

    const slice = aggregateGroup(comparisons);

    expect(slice.count).toBe(3);
    expect(slice.meanSignedDelta).toBeCloseTo(5);
    expect(slice.meanAbsError).toBeCloseTo(35 / 3);
    expect(slice.overScoreCount).toBe(1);
    expect(slice.underScoreCount).toBe(0);
  });

  it("uses DIVERGENCE_FLAG_THRESHOLD for over/under counts", () => {
    const threshold = DIVERGENCE_FLAG_THRESHOLD;
    const comparisons = [
      makeComparison({ scoreDelta: threshold + 1 }),
      makeComparison({ corpusItemId: "item-2", scoreDelta: -(threshold + 1) }),
      makeComparison({ corpusItemId: "item-3", scoreDelta: threshold }),
    ];

    const slice = aggregateGroup(comparisons);

    expect(slice.overScoreCount).toBe(1);
    expect(slice.underScoreCount).toBe(1);
  });

  it("returns null means for empty input instead of zero", () => {
    const slice = aggregateGroup([]);

    expect(slice).toEqual({
      count: 0,
      meanSignedDelta: null,
      meanAbsError: null,
      overScoreCount: 0,
      underScoreCount: 0,
    });
  });

  it("excludes comparisons with null scoreDelta from means", () => {
    const comparisons = [
      makeComparison({ scoreDelta: 10, absError: 10 }),
      makeComparison({
        corpusItemId: "item-2",
        automaticQualityScore: null,
        scoreDelta: null,
        absError: null,
      }),
    ];

    const slice = aggregateGroup(comparisons);

    expect(slice.count).toBe(1);
    expect(slice.meanSignedDelta).toBe(10);
    expect(slice.meanAbsError).toBe(10);
  });
});

describe("groupComparisonsBy", () => {
  it("groups by primaryFailureReason", () => {
    const comparisons = [
      makeComparison({
        corpusItemId: "a",
        primaryFailureReason: "visual_overload",
        scoreDelta: 20,
      }),
      makeComparison({
        corpusItemId: "b",
        primaryFailureReason: "visual_overload",
        scoreDelta: 10,
      }),
      makeComparison({
        corpusItemId: "c",
        primaryFailureReason: "weak_hierarchy",
        scoreDelta: -5,
      }),
    ];

    const grouped = groupComparisonsBy(comparisons, "primaryFailureReason");

    expect(Object.keys(grouped)).toEqual(
      expect.arrayContaining(["visual_overload", "weak_hierarchy"])
    );
    expect(grouped.visual_overload.count).toBe(2);
    expect(grouped.visual_overload.meanSignedDelta).toBe(15);
    expect(grouped.weak_hierarchy.count).toBe(1);
  });

  it("groups by generationMode", () => {
    const comparisons = [
      makeComparison({ corpusItemId: "a", generationMode: "restyling", scoreDelta: 8 }),
      makeComparison({ corpusItemId: "b", generationMode: "art_variation", scoreDelta: 12 }),
    ];

    const grouped = groupComparisonsBy(comparisons, "generationMode");

    expect(grouped.restyling.count).toBe(1);
    expect(grouped.art_variation.count).toBe(1);
  });

  it("groups by format", () => {
    const comparisons = [
      makeComparison({ corpusItemId: "a", format: "9:16", scoreDelta: 3 }),
      makeComparison({ corpusItemId: "b", format: "1:1", scoreDelta: 7 }),
    ];

    const grouped = groupComparisonsBy(comparisons, "format");

    expect(grouped["9:16"].count).toBe(1);
    expect(grouped["1:1"].count).toBe(1);
  });
});

describe("buildCompositeSliceKey", () => {
  it("joins failure reason, mode and format for adjustment slices", () => {
    expect(
      buildCompositeSliceKey("visual_overload", "art_variation", "1:1")
    ).toBe("visual_overload|art_variation|1:1");
  });
});
