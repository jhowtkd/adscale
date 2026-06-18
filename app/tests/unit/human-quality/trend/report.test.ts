import { describe, it, expect } from "vitest";
import { buildQualityTrendReport } from "@/server/human-quality/trend/report";
import { buildTrendGuidance } from "@/server/human-quality/sampling/guidance";
import type { EvaluatedCorpusRow } from "@/server/human-quality/calibration/types";
import {
  TREND_GLOBAL_MIN_EVALUATED,
  TREND_MIN_TIME_BUCKETS,
} from "@/server/human-quality/sampling/thresholds";

function makeRow(
  createdAt: string,
  id: string,
  visualScore = 70
): EvaluatedCorpusRow {
  return {
    item: {
      id,
      workspaceId: "ws-1",
      clientProfileId: "client-1",
      campaignId: "camp-1",
      derivationId: "deriv-1",
      generationMode: "art_variation",
      format: "1:1",
      cohort: "baseline",
      corpusVersion: 1,
      status: "evaluated",
      artifactRef: { derivationId: "deriv-1" },
      qualitySnapshot: null,
      selectedByUserId: "user-1",
      selectedAt: new Date(createdAt),
      createdAt: new Date(createdAt),
      updatedAt: new Date(createdAt),
    },
    evaluation: {
      id: `eval-${id}`,
      workspaceId: "ws-1",
      corpusItemId: id,
      reviewerUserId: "reviewer-1",
      visualScore,
      factualPass: true,
      intent: "approve",
      primaryFailureReason: "other",
      otherReasonText: null,
      notes: null,
      evaluatedAt: new Date(createdAt),
      createdAt: new Date(createdAt),
      updatedAt: new Date(createdAt),
    },
  } as EvaluatedCorpusRow;
}

function makeRowsAcrossWeeks(count: number): EvaluatedCorpusRow[] {
  const rows: EvaluatedCorpusRow[] = [];
  for (let index = 0; index < count; index += 1) {
    const weekOffset = Math.floor(index / 3);
    const day = 15 + weekOffset * 7;
    rows.push(
      makeRow(
        `2026-06-${String(day).padStart(2, "0")}T10:00:00.000Z`,
        `corpus-${index}`,
        70 + index
      )
    );
  }
  return rows;
}

describe("buildTrendGuidance", () => {
  it("returns trend_global guidance when evaluated count is insufficient", () => {
    const guidance = buildTrendGuidance({
      evaluatedItemCount: 2,
      populatedBucketCount: 2,
    });

    expect(guidance).toHaveLength(1);
    expect(guidance[0]).toMatchObject({
      gate: "trend_global",
      currentCount: 2,
      requiredCount: TREND_GLOBAL_MIN_EVALUATED,
      additionalNeeded: 3,
      blockedClaim: "quality trend direction",
    });
  });

  it("returns trend_time_buckets guidance when bucket count is insufficient", () => {
    const guidance = buildTrendGuidance({
      evaluatedItemCount: TREND_GLOBAL_MIN_EVALUATED,
      populatedBucketCount: 1,
    });

    expect(guidance).toHaveLength(1);
    expect(guidance[0]).toMatchObject({
      gate: "trend_time_buckets",
      currentCount: 1,
      requiredCount: TREND_MIN_TIME_BUCKETS,
      additionalNeeded: 1,
      blockedClaim: "quality trend direction",
    });
  });

  it("returns empty guidance when global and time bucket gates pass", () => {
    expect(
      buildTrendGuidance({
        evaluatedItemCount: TREND_GLOBAL_MIN_EVALUATED,
        populatedBucketCount: TREND_MIN_TIME_BUCKETS,
      })
    ).toEqual([]);
  });
});

describe("buildQualityTrendReport", () => {
  it("sets status ok only when global count and populated buckets meet thresholds", () => {
    const sufficientRows = makeRowsAcrossWeeks(TREND_GLOBAL_MIN_EVALUATED);
    const okReport = buildQualityTrendReport({
      rows: sufficientRows,
      capturedAt: "2026-06-30T00:00:00.000Z",
    });

    expect(okReport.status).toBe("ok");
    expect(okReport.evaluatedItemCount).toBe(TREND_GLOBAL_MIN_EVALUATED);
    expect(okReport.populatedBucketCount).toBeGreaterThanOrEqual(
      TREND_MIN_TIME_BUCKETS
    );

    const insufficientRows = makeRowsAcrossWeeks(2);
    const insufficientReport = buildQualityTrendReport({
      rows: insufficientRows,
      capturedAt: "2026-06-30T00:00:00.000Z",
    });

    expect(insufficientReport.status).toBe("insufficient_sample");
  });

  it("exposes three independent alert flags", () => {
    const rows = [
      makeRow("2026-06-15T10:00:00.000Z", "a", 80),
      makeRow("2026-06-15T11:00:00.000Z", "b", 78),
      makeRow("2026-06-15T12:00:00.000Z", "c", 82),
      makeRow("2026-06-22T10:00:00.000Z", "d", 70),
      makeRow("2026-06-22T11:00:00.000Z", "e", 68),
      makeRow("2026-06-22T12:00:00.000Z", "f", 66),
    ];

    const report = buildQualityTrendReport({
      rows,
      capturedAt: "2026-06-10T00:00:00.000Z",
    });

    expect(report.alertFlags.insufficientCoverage).toBe(false);
    expect(report.alertFlags.staleEvidence).toBe(true);
    expect(report.alertFlags.regressionDetected).toBe(true);
    expect(report.alertFlags.reasons?.staleEvidence).toBeTruthy();
    expect(report.alertFlags.reasons?.regressionDetected).toBeTruthy();
  });

  it("sets insufficientCoverage when status is insufficient or guidance is present", () => {
    const report = buildQualityTrendReport({
      rows: makeRowsAcrossWeeks(2),
      capturedAt: "2026-06-30T00:00:00.000Z",
    });

    expect(report.status).toBe("insufficient_sample");
    expect(report.alertFlags.insufficientCoverage).toBe(true);
    expect(report.sampleGuidance.length).toBeGreaterThan(0);
  });

  it("caps evidence refs at 100 items with truncated flag", () => {
    const rows = Array.from({ length: 105 }, (_, index) =>
      makeRow(
        `2026-06-15T${String(10 + (index % 10)).padStart(2, "0")}:00:00.000Z`,
        `corpus-${index}`,
        70
      )
    );

    const report = buildQualityTrendReport({
      rows,
      capturedAt: "2026-06-30T00:00:00.000Z",
    });

    const bucket = report.buckets.find((entry) => entry.count > 0);
    expect(bucket?.evidenceRefs).toBeTruthy();
    expect(bucket?.evidenceRefs?.corpusItemIds).toHaveLength(100);
    expect(bucket?.evidenceRefs?.itemRefs).toHaveLength(100);
    expect(bucket?.evidenceRefs?.truncated).toBe(true);
    expect(bucket?.evidenceRefs?.totalCount).toBe(105);
  });

  it("sorts buckets ascending by bucketKey and tags live_human evidence source", () => {
    const report = buildQualityTrendReport({
      rows: makeRowsAcrossWeeks(TREND_GLOBAL_MIN_EVALUATED),
      capturedAt: "2026-06-30T00:00:00.000Z",
      truncated: true,
    });

    const keys = report.buckets.map((bucket) => bucket.bucketKey);
    expect(keys).toEqual([...keys].sort());
    expect(report.evidenceSource).toBe("live_human");
    expect(report.truncated).toBe(true);
  });
});
