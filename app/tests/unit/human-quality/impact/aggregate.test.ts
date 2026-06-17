import { describe, it, expect } from "vitest";
import type { ImpactEvaluatedRow } from "@/server/human-quality/impact/types";
import {
  computeArmMetrics,
  computeCohortMovement,
  computeGlobalVisualDelta,
  computeSliceComparison,
  partitionImpactSlices,
} from "@/server/human-quality/impact/aggregate";

function makeImpactRow(
  overrides: Partial<ImpactEvaluatedRow> = {}
): ImpactEvaluatedRow {
  return {
    corpusItemId: "corpus-1",
    clientProfileId: "client-1",
    generationMode: "art_variation",
    format: "1:1",
    cohort: "baseline",
    learningApplied: false,
    applicationResolution: "not_recorded",
    visualScore: 70,
    factualPass: true,
    intent: "approve",
    ...overrides,
  };
}

describe("partitionImpactSlices", () => {
  it("groups rows by clientProfileId|generationMode|format", () => {
    const rows = [
      makeImpactRow({ corpusItemId: "a", clientProfileId: "c1" }),
      makeImpactRow({
        corpusItemId: "b",
        clientProfileId: "c1",
        generationMode: "restyling",
      }),
      makeImpactRow({ corpusItemId: "c", clientProfileId: "c2" }),
    ];

    const partitions = partitionImpactSlices(rows);

    expect(partitions.size).toBe(3);
    expect(partitions.get("c1|art_variation|1:1")).toHaveLength(1);
    expect(partitions.get("c1|restyling|1:1")).toHaveLength(1);
    expect(partitions.get("c2|art_variation|1:1")).toHaveLength(1);
  });
});

describe("computeArmMetrics", () => {
  it("computes mean visual score and intent rates", () => {
    const rows = [
      makeImpactRow({ visualScore: 80, intent: "approve", factualPass: true }),
      makeImpactRow({
        corpusItemId: "c2",
        visualScore: 60,
        intent: "reject",
        factualPass: false,
      }),
      makeImpactRow({
        corpusItemId: "c3",
        visualScore: 70,
        intent: "regenerate",
        factualPass: true,
      }),
    ];

    const metrics = computeArmMetrics(rows);

    expect(metrics.count).toBe(3);
    expect(metrics.meanVisualScore).toBeCloseTo(70);
    expect(metrics.rejectIntentRate).toBeCloseTo(1 / 3);
    expect(metrics.regenerateIntentRate).toBeCloseTo(1 / 3);
    expect(metrics.factualPassRate).toBeCloseTo(2 / 3);
  });

  it("returns null rates when arm count is 0", () => {
    const metrics = computeArmMetrics([]);

    expect(metrics).toEqual({
      count: 0,
      meanVisualScore: null,
      rejectIntentRate: null,
      regenerateIntentRate: null,
      factualPassRate: null,
    });
  });
});

describe("computeSliceComparison", () => {
  it("splits learned vs non_learned arms and computes visualScoreDelta", () => {
    const learnedRows = Array.from({ length: 3 }, (_, index) =>
      makeImpactRow({
        corpusItemId: `learned-${index}`,
        learningApplied: true,
        visualScore: 80,
        applicationResolution: "recorded",
      })
    );
    const nonLearnedRows = Array.from({ length: 3 }, (_, index) =>
      makeImpactRow({
        corpusItemId: `non-${index}`,
        learningApplied: false,
        visualScore: 60,
      })
    );

    const comparison = computeSliceComparison("c1|art_variation|1:1", [
      ...learnedRows,
      ...nonLearnedRows,
    ]);

    expect(comparison.comparability).toBe("ok");
    expect(comparison.learned.count).toBe(3);
    expect(comparison.nonLearned.count).toBe(3);
    expect(comparison.visualScoreDelta).toBeCloseTo(20);
  });

  it("marks comparability insufficient when either arm has fewer than 3 items", () => {
    const comparison = computeSliceComparison("c1|art_variation|1:1", [
      makeImpactRow({ learningApplied: true, visualScore: 90 }),
      makeImpactRow({
        corpusItemId: "n1",
        learningApplied: false,
        visualScore: 50,
      }),
      makeImpactRow({
        corpusItemId: "n2",
        learningApplied: false,
        visualScore: 55,
      }),
      makeImpactRow({
        corpusItemId: "n3",
        learningApplied: false,
        visualScore: 60,
      }),
    ]);

    expect(comparison.comparability).toBe("insufficient");
    expect(comparison.visualScoreDelta).toBeNull();
  });
});

describe("computeGlobalVisualDelta", () => {
  it("averages comparable slice deltas only", () => {
    const slices = [
      computeSliceComparison(
        "s1",
        [
          ...Array.from({ length: 3 }, (_, i) =>
            makeImpactRow({
              corpusItemId: `l1-${i}`,
              learningApplied: true,
              visualScore: 80,
            })
          ),
          ...Array.from({ length: 3 }, (_, i) =>
            makeImpactRow({
              corpusItemId: `n1-${i}`,
              learningApplied: false,
              visualScore: 60,
            })
          ),
        ]
      ),
      computeSliceComparison(
        "s2",
        [
          ...Array.from({ length: 3 }, (_, i) =>
            makeImpactRow({
              corpusItemId: `l2-${i}`,
              learningApplied: true,
              visualScore: 70,
            })
          ),
          ...Array.from({ length: 3 }, (_, i) =>
            makeImpactRow({
              corpusItemId: `n2-${i}`,
              learningApplied: false,
              visualScore: 50,
            })
          ),
        ]
      ),
      computeSliceComparison("s3", [
        makeImpactRow({ learningApplied: true, visualScore: 90 }),
        makeImpactRow({
          corpusItemId: "n-only",
          learningApplied: false,
          visualScore: 40,
        }),
      ]),
    ];

    expect(computeGlobalVisualDelta(slices)).toBeCloseTo(20);
  });

  it("returns null when no comparable slices exist", () => {
    expect(computeGlobalVisualDelta([])).toBeNull();
  });
});

describe("computeCohortMovement", () => {
  it("computes pre_learning vs post_learning means", () => {
    const movement = computeCohortMovement([
      makeImpactRow({ cohort: "pre_learning", visualScore: 60 }),
      makeImpactRow({
        corpusItemId: "pre-2",
        cohort: "pre_learning",
        visualScore: 70,
      }),
      makeImpactRow({
        corpusItemId: "post-1",
        cohort: "post_learning",
        visualScore: 80,
      }),
      makeImpactRow({
        corpusItemId: "post-2",
        cohort: "post_learning",
        visualScore: 90,
      }),
    ]);

    expect(movement.preLearningMean).toBeCloseTo(65);
    expect(movement.postLearningMean).toBeCloseTo(85);
    expect(movement.deltaPostMinusPre).toBeCloseTo(20);
  });
});
