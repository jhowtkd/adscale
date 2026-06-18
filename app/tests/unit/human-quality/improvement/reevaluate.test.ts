import { describe, it, expect } from "vitest";
import type { CalibrationComparison } from "@/server/human-quality/calibration/types";
import type { EvaluatedCorpusRow } from "@/server/human-quality/calibration/types";
import {
  PRE_132_02_FIXTURE_BASELINE_PASS_RATE,
  buildQualityImprovementReport,
  computeFixtureArchetypePassRate,
  failureRatesByReason,
  splitComparisonsByArm,
} from "@/server/human-quality/improvement/reevaluate";
import { TARGETED_VISUAL_FAILURE_REASONS } from "@/server/human-quality/improvement/types";

function makeComparison(
  overrides: Partial<CalibrationComparison> & { corpusItemId: string }
): CalibrationComparison {
  return {
    derivationId: "deriv-1",
    generationMode: "art_variation",
    format: "1:1",
    cohort: "baseline",
    automaticQualityScore: 80,
    humanVisualScore: 60,
    scoreDelta: 20,
    absError: 20,
    primaryFailureReason: "visual_overload",
    factualPass: true,
    qualityVerdict: "improvable",
    hardFailureCodes: [],
    ...overrides,
  };
}

function makeRow(
  corpusItemId: string,
  cohort: string,
  selectedAt: string
): EvaluatedCorpusRow {
  return {
    item: {
      id: corpusItemId,
      cohort,
      selectedAt: new Date(selectedAt),
    } as EvaluatedCorpusRow["item"],
    evaluation: {
      primaryFailureReason: "visual_overload",
      factualPass: true,
      visualScore: 60,
    } as EvaluatedCorpusRow["evaluation"],
  };
}

describe("failureRatesByReason", () => {
  it("counts targeted visual failure reasons only", () => {
    const comparisons = [
      makeComparison({ corpusItemId: "a", primaryFailureReason: "visual_overload" }),
      makeComparison({ corpusItemId: "b", primaryFailureReason: "visual_overload" }),
      makeComparison({ corpusItemId: "c", primaryFailureReason: "weak_hierarchy" }),
      makeComparison({ corpusItemId: "d", primaryFailureReason: "factual_issue" }),
    ];

    const rates = failureRatesByReason(comparisons);

    expect(rates.visual_overload).toEqual({ count: 2, rate: 0.5 });
    expect(rates.weak_hierarchy).toEqual({ count: 1, rate: 0.25 });
    expect(rates.generic_template_feel).toEqual({ count: 0, rate: 0 });
    expect(rates.factual_issue).toBeUndefined();
  });

  it("returns null rate when comparison set is empty", () => {
    const rates = failureRatesByReason([]);
    for (const reason of TARGETED_VISUAL_FAILURE_REASONS) {
      expect(rates[reason]).toEqual({ count: 0, rate: null });
    }
  });
});

describe("splitComparisonsByArm", () => {
  const deployedAt = "2026-06-10T00:00:00.000Z";

  it("routes post_learning cohort to after arm only", () => {
    const rows = [
      makeRow("post-1", "post_learning", "2026-06-11T00:00:00.000Z"),
      makeRow("base-1", "baseline", "2026-06-05T00:00:00.000Z"),
      makeRow("pre-1", "pre_learning", "2026-06-08T00:00:00.000Z"),
    ];
    const comparisons = rows.map((row) =>
      makeComparison({ corpusItemId: row.item.id, cohort: row.item.cohort })
    );

    const { before, after } = splitComparisonsByArm(rows, comparisons, deployedAt);

    expect(after.map((c) => c.corpusItemId)).toEqual(["post-1"]);
    expect(before.map((c) => c.corpusItemId).sort()).toEqual(["base-1", "pre-1"]);
  });

  it("includes items selected before improvementDeployedAt in before arm", () => {
    const rows = [
      makeRow("late-baseline", "baseline", "2026-06-15T00:00:00.000Z"),
      makeRow("early-other", "baseline", "2026-06-01T00:00:00.000Z"),
    ];
    const comparisons = rows.map((row) =>
      makeComparison({ corpusItemId: row.item.id, cohort: row.item.cohort })
    );

    const { before } = splitComparisonsByArm(rows, comparisons, deployedAt);

    expect(before.map((c) => c.corpusItemId).sort()).toEqual(["early-other", "late-baseline"]);
  });
});

describe("computeFixtureArchetypePassRate", () => {
  it("uses pre-132-02 baseline snapshot constant for before arm", () => {
    expect(computeFixtureArchetypePassRate(true)).toBe(PRE_132_02_FIXTURE_BASELINE_PASS_RATE);
  });

  it("computes live gate detection pass rate for after arm", () => {
    const rate = computeFixtureArchetypePassRate(false);
    expect(rate).not.toBeNull();
    expect(rate).toBeGreaterThanOrEqual(0);
    expect(rate).toBeLessThanOrEqual(1);
  });
});

describe("buildQualityImprovementReport", () => {
  const acceptedAdjustments = [
    {
      adjustmentId: "adj-1",
      targetModule: "score_ceiling",
      targetKey: "visual_overload",
    },
  ];

  function buildBeforeComparisons(count: number, reason = "visual_overload") {
    return Array.from({ length: count }, (_, index) =>
      makeComparison({
        corpusItemId: `before-${index}`,
        primaryFailureReason: reason as CalibrationComparison["primaryFailureReason"],
        factualPass: index % 2 === 0,
      })
    );
  }

  it("returns insufficient_sample when after arm is empty", () => {
    const before = buildBeforeComparisons(5);

    const report = buildQualityImprovementReport({
      beforeComparisons: before,
      afterComparisons: [],
      acceptedAdjustments,
      capturedAt: "2026-06-17T12:00:00.000Z",
    });

    expect(report.status).toBe("insufficient_sample");
    expect(report.sampleGuidance.length).toBeGreaterThan(0);
    expect(
      report.sampleGuidance.some(
        (item) =>
          item.gate === "quality_improvement_reason" && item.arm === "after"
      )
    ).toBe(true);
    expect(report.visualMetrics.deltaRateByReason.visual_overload).toBeNull();
    expect(report.factualMetrics.factualPassRateBefore).not.toBeNull();
    expect(report.factualMetrics.factualPassRateAfter).toBeNull();
  });

  it("returns ok with negative delta when failure rate decreased", () => {
    function buildArm(
      prefix: string,
      cohort: string,
      overloadCount: number
    ): CalibrationComparison[] {
      const comparisons: CalibrationComparison[] = [];
      let index = 0;

      const pushReason = (reason: CalibrationComparison["primaryFailureReason"], count: number) => {
        for (let i = 0; i < count; i += 1) {
          comparisons.push(
            makeComparison({
              corpusItemId: `${prefix}-${reason}-${index}`,
              cohort,
              primaryFailureReason: reason,
            })
          );
          index += 1;
        }
      };

      pushReason("visual_overload", overloadCount);
      pushReason("weak_hierarchy", 3);
      pushReason("generic_template_feel", 3);
      pushReason("illegible_cta", 3);
      pushReason("unfocused_composition", 3);

      return comparisons;
    }

    const before = buildArm("before", "baseline", 6);
    const after = buildArm("after", "post_learning", 3);

    const report = buildQualityImprovementReport({
      beforeComparisons: before,
      afterComparisons: after,
      acceptedAdjustments,
      capturedAt: "2026-06-17T12:00:00.000Z",
    });

    expect(report.status).toBe("ok");
    expect(report.sampleGuidance).toEqual([]);
    expect(report.visualMetrics.deltaRateByReason.visual_overload).toBeLessThan(0);
    expect(report.fixtureMetrics?.targetedArchetypePassRateAfter).not.toBeNull();
    expect(report.fixtureMetrics?.evidenceSource).toBe("fixture");
    expect(report.fixtureMetrics?.denominatorNote).toContain("not human corpus");
  });

  it("nulls deltaRateByReason when any targeted reason is below MIN_SLICE_SAMPLE", () => {
    const before = buildBeforeComparisons(3);
    const after = [
      makeComparison({ corpusItemId: "after-0", cohort: "post_learning" }),
      makeComparison({ corpusItemId: "after-1", cohort: "post_learning" }),
    ];

    const report = buildQualityImprovementReport({
      beforeComparisons: before,
      afterComparisons: after,
      acceptedAdjustments,
      capturedAt: "2026-06-17T12:00:00.000Z",
    });

    expect(report.status).toBe("insufficient_sample");
    expect(report.sampleGuidance.length).toBeGreaterThan(0);
    expect(
      report.sampleGuidance.some(
        (item) =>
          item.gate === "quality_improvement_reason" &&
          item.additionalNeeded > 0
      )
    ).toBe(true);
    for (const reason of TARGETED_VISUAL_FAILURE_REASONS) {
      expect(report.visualMetrics.deltaRateByReason[reason]).toBeNull();
    }
  });

  it("keeps factual metrics separate from visual headline", () => {
    function buildArm(prefix: string, cohort: string): CalibrationComparison[] {
      const comparisons: CalibrationComparison[] = [];
      let index = 0;
      const reasons: CalibrationComparison["primaryFailureReason"][] = [
        "visual_overload",
        "weak_hierarchy",
        "generic_template_feel",
        "illegible_cta",
        "unfocused_composition",
      ];

      for (const reason of reasons) {
        for (let i = 0; i < 3; i += 1) {
          comparisons.push(
            makeComparison({
              corpusItemId: `${prefix}-${index}`,
              cohort,
              primaryFailureReason: reason,
              factualPass: index % 2 === 0,
            })
          );
          index += 1;
        }
      }

      return comparisons;
    }

    const before = buildArm("before", "baseline");
    const after = buildArm("after", "post_learning");

    const report = buildQualityImprovementReport({
      beforeComparisons: before,
      afterComparisons: after,
      acceptedAdjustments,
      capturedAt: "2026-06-17T12:00:00.000Z",
    });

    expect(report.factualMetrics.factualPassRateBefore).toBeCloseTo(8 / 15);
    expect(report.factualMetrics.factualPassRateAfter).toBeCloseTo(8 / 15);
    expect(report.visualMetrics.failureFrequencyBefore).toBeDefined();
    expect(report.visualMetrics.failureFrequencyAfter).toBeDefined();
  });
});
