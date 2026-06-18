import { describe, it, expect } from "vitest";
import {
  bucketKeyForDate,
  groupEvaluatedRowsByBucket,
} from "@/server/human-quality/trend/bucket";
import type { EvaluatedCorpusRow } from "@/server/human-quality/calibration/types";

function makeRow(createdAt: string, id = "corpus-1"): EvaluatedCorpusRow {
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
      selectedAt: new Date("2026-06-01"),
      createdAt: new Date("2026-06-01"),
      updatedAt: new Date("2026-06-01"),
    },
    evaluation: {
      id: `eval-${id}`,
      workspaceId: "ws-1",
      corpusItemId: id,
      reviewerUserId: "reviewer-1",
      visualScore: 70,
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

describe("bucketKeyForDate", () => {
  it("returns YYYY-Www for known UTC dates", () => {
    expect(bucketKeyForDate(new Date("2026-01-01T12:00:00.000Z"))).toBe("2026-W01");
    expect(bucketKeyForDate(new Date("2026-06-15T00:00:00.000Z"))).toBe("2026-W25");
  });

  it("handles year boundary — late December may belong to next ISO year", () => {
    expect(bucketKeyForDate(new Date("2025-12-29T00:00:00.000Z"))).toBe("2026-W01");
    expect(bucketKeyForDate(new Date("2024-12-30T00:00:00.000Z"))).toBe("2025-W01");
  });

  it("handles ISO week 53 years", () => {
    expect(bucketKeyForDate(new Date("2020-12-28T00:00:00.000Z"))).toBe("2020-W53");
    expect(bucketKeyForDate(new Date("2015-12-31T00:00:00.000Z"))).toBe("2015-W53");
  });

  it("groups mid-week dates in the same ISO week", () => {
    const monday = bucketKeyForDate(new Date("2026-06-15T00:00:00.000Z"));
    const sunday = bucketKeyForDate(new Date("2026-06-21T23:59:59.999Z"));
    expect(monday).toBe(sunday);
    expect(monday).toBe("2026-W25");
  });
});

describe("groupEvaluatedRowsByBucket", () => {
  it("returns empty Map for empty input", () => {
    expect(groupEvaluatedRowsByBucket([])).toEqual(new Map());
  });

  it("groups two evaluations in the same ISO week into one bucket", () => {
    const rows = [
      makeRow("2026-06-15T10:00:00.000Z", "a"),
      makeRow("2026-06-18T14:00:00.000Z", "b"),
    ];
    const grouped = groupEvaluatedRowsByBucket(rows);

    expect(grouped.size).toBe(1);
    expect(grouped.get("2026-W25")).toHaveLength(2);
  });

  it("keeps adjacent ISO weeks in separate buckets", () => {
    const rows = [
      makeRow("2026-06-15T10:00:00.000Z", "a"),
      makeRow("2026-06-22T10:00:00.000Z", "b"),
    ];
    const grouped = groupEvaluatedRowsByBucket(rows);

    expect(grouped.size).toBe(2);
    expect(grouped.get("2026-W25")).toHaveLength(1);
    expect(grouped.get("2026-W26")).toHaveLength(1);
  });

  it("buckets by evaluation.createdAt not item.selectedAt", () => {
    const row = makeRow("2026-06-15T10:00:00.000Z");
    row.item.selectedAt = new Date("2026-07-01T00:00:00.000Z");

    const grouped = groupEvaluatedRowsByBucket([row]);
    expect(grouped.has("2026-W25")).toBe(true);
    expect(grouped.has("2026-W27")).toBe(false);
  });
});
