import { describe, it, expect } from "vitest";
import type { ImpactEvaluatedRow } from "@/server/human-quality/impact/types";
import {
  buildLearningImpactReport,
  MIN_GLOBAL_IMPACT_ITEMS,
  MIN_ARM_SAMPLE,
} from "@/server/human-quality/impact/report";

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

function makeComparableSliceRows(
  slicePrefix: string,
  learnedScore: number,
  nonLearnedScore: number
): ImpactEvaluatedRow[] {
  const learned = Array.from({ length: MIN_ARM_SAMPLE }, (_, index) =>
    makeImpactRow({
      corpusItemId: `${slicePrefix}-l-${index}`,
      clientProfileId: slicePrefix,
      learningApplied: true,
      visualScore: learnedScore,
      applicationResolution: "recorded",
    })
  );
  const nonLearned = Array.from({ length: MIN_ARM_SAMPLE }, (_, index) =>
    makeImpactRow({
      corpusItemId: `${slicePrefix}-n-${index}`,
      clientProfileId: slicePrefix,
      learningApplied: false,
      visualScore: nonLearnedScore,
    })
  );
  return [...learned, ...nonLearned];
}

describe("buildLearningImpactReport", () => {
  it("returns insufficient_sample when global evaluated count is below minimum", () => {
    const rows = Array.from({ length: MIN_GLOBAL_IMPACT_ITEMS - 1 }, (_, i) =>
      makeImpactRow({ corpusItemId: `c-${i}` })
    );

    const report = buildLearningImpactReport({
      rows,
      unlabeledCount: rows.length,
      capturedAt: "2026-06-17T00:00:00.000Z",
    });

    expect(report.status).toBe("insufficient_sample");
    expect(report.insufficientReasons).toContain("global_below_minimum");
    expect(report.learningImpactMetrics.globalVisualScoreDelta).toBeNull();
    expect(
      report.visualMovementMetrics.deltaLearnedMinusNonLearned
    ).toBeNull();
  });

  it("returns ok when global minimum met and at least one comparable slice exists", () => {
    const rows = makeComparableSliceRows("client-ok", 80, 60);

    const report = buildLearningImpactReport({
      rows,
      unlabeledCount: MIN_ARM_SAMPLE,
      capturedAt: "2026-06-17T00:00:00.000Z",
    });

    expect(report.status).toBe("ok");
    expect(report.insufficientReasons).toHaveLength(0);
    expect(report.learningImpactMetrics.globalVisualScoreDelta).toBeCloseTo(20);
    expect(
      report.visualMovementMetrics.deltaLearnedMinusNonLearned
    ).toBeCloseTo(20);
  });

  it("returns insufficient_sample when no slice has both arms at minimum sample", () => {
    const rows = [
      ...Array.from({ length: MIN_GLOBAL_IMPACT_ITEMS }, (_, i) =>
        makeImpactRow({
          corpusItemId: `only-learned-${i}`,
          learningApplied: true,
          applicationResolution: "recorded",
        })
      ),
    ];

    const report = buildLearningImpactReport({
      rows,
      unlabeledCount: 0,
      capturedAt: "2026-06-17T00:00:00.000Z",
    });

    expect(report.status).toBe("insufficient_sample");
    expect(report.insufficientReasons).toContain("no_comparable_slices");
    expect(report.learningImpactMetrics.globalVisualScoreDelta).toBeNull();
    expect(
      report.visualMovementMetrics.deltaLearnedMinusNonLearned
    ).toBeNull();
  });

  it("keeps intent and factual metrics populated when status is insufficient_sample", () => {
    const rows = [
      makeImpactRow({
        learningApplied: true,
        intent: "reject",
        factualPass: false,
        applicationResolution: "recorded",
      }),
      makeImpactRow({
        corpusItemId: "c2",
        learningApplied: false,
        intent: "approve",
        factualPass: true,
      }),
    ];

    const report = buildLearningImpactReport({
      rows,
      unlabeledCount: 1,
      capturedAt: "2026-06-17T00:00:00.000Z",
    });

    expect(report.status).toBe("insufficient_sample");
    expect(report.intentMetrics.learned.rejectRate).toBe(1);
    expect(report.intentMetrics.nonLearned.rejectRate).toBe(0);
    expect(report.factualMetrics.learnedFactualPassRate).toBe(0);
    expect(report.factualMetrics.nonLearnedFactualPassRate).toBe(1);
    expect(
      report.visualMovementMetrics.deltaLearnedMinusNonLearned
    ).toBeNull();
  });

  it("exposes separate top-level metric buckets", () => {
    const rows = makeComparableSliceRows("client-buckets", 75, 65);

    const report = buildLearningImpactReport({
      rows,
      unlabeledCount: MIN_ARM_SAMPLE,
      capturedAt: "2026-06-17T00:00:00.000Z",
    });

    expect(report.learningImpactMetrics).toBeDefined();
    expect(report.intentMetrics).toBeDefined();
    expect(report.visualMovementMetrics).toBeDefined();
    expect(report.factualMetrics).toBeDefined();
    expect(report.learningImpactMetrics.unlabeledCount).toBe(MIN_ARM_SAMPLE);
    expect(report.learningImpactMetrics.learnedCount).toBe(MIN_ARM_SAMPLE);
    expect(report.learningImpactMetrics.nonLearnedCount).toBe(MIN_ARM_SAMPLE);
    expect(report.rows).toHaveLength(rows.length);
  });

  it("nulls slice visualScoreDelta when either arm is below minimum sample", () => {
    const rows = [
      ...Array.from({ length: MIN_ARM_SAMPLE }, (_, i) =>
        makeImpactRow({
          corpusItemId: `learned-${i}`,
          learningApplied: true,
          visualScore: 80,
          applicationResolution: "recorded",
        })
      ),
      makeImpactRow({
        corpusItemId: "single-non",
        learningApplied: false,
        visualScore: 50,
      }),
      ...Array.from({ length: MIN_GLOBAL_IMPACT_ITEMS - 1 }, (_, i) =>
        makeImpactRow({
          corpusItemId: `filler-${i}`,
          clientProfileId: "other-client",
          learningApplied: false,
        })
      ),
    ];

    const report = buildLearningImpactReport({
      rows,
      unlabeledCount: 0,
      capturedAt: "2026-06-17T00:00:00.000Z",
    });

    const slice = report.learningImpactMetrics.slices.find((s) =>
      s.sliceKey.startsWith("client-1")
    );
    expect(slice?.comparability).toBe("insufficient");
    expect(slice?.visualScoreDelta).toBeNull();
  });
});
