import { describe, it, expect } from "vitest";
import {
  buildImpactRow,
  buildImpactRows,
  resolveLearningApplied,
} from "@/server/human-quality/impact/enrich";
import { buildImpactSliceKey } from "@/server/human-quality/impact/types";
import type { EvaluatedCorpusRow } from "@/server/human-quality/calibration/types";
import type { OutputLearningApplicationSnapshot } from "@/server/human-quality/corpus";

const recordedApplication: OutputLearningApplicationSnapshot = {
  schemaVersion: 1,
  applied: true,
  resolution: "recorded",
  traceId: "ol-trace-abc",
  recommendationId: "rec-001",
  primaryVariableKey: "cta",
  algorithmVersion: "1.0.0",
  safetyVersion: "1.0.0",
  learningsSource: "postgres",
};

function makeEvaluatedRow(
  qualitySnapshot: Record<string, unknown> | null
): EvaluatedCorpusRow {
  return {
    item: {
      id: "corpus-1",
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
      qualitySnapshot,
      selectedByUserId: "user-1",
      selectedAt: new Date("2026-06-01"),
      createdAt: new Date("2026-06-01"),
      updatedAt: new Date("2026-06-02"),
    },
    evaluation: {
      id: "eval-1",
      workspaceId: "ws-1",
      corpusItemId: "corpus-1",
      reviewerUserId: "reviewer-1",
      visualScore: 72,
      factualPass: true,
      intent: "approve",
      primaryFailureReason: "other",
      otherReasonText: null,
      notes: null,
      evaluatedAt: new Date("2026-06-02"),
      createdAt: new Date("2026-06-02"),
      updatedAt: new Date("2026-06-02"),
    },
  } as EvaluatedCorpusRow;
}

describe("resolveLearningApplied", () => {
  it("returns true when snapshot.applied is true", () => {
    expect(
      resolveLearningApplied({
        outputLearningApplication: recordedApplication,
      })
    ).toBe(true);
  });

  it("returns false when application metadata is missing", () => {
    expect(resolveLearningApplied({})).toBe(false);
    expect(resolveLearningApplied({ outputLearningApplication: undefined })).toBe(false);
  });

  it("returns false when applied is false", () => {
    expect(
      resolveLearningApplied({
        outputLearningApplication: {
          ...recordedApplication,
          applied: false,
          resolution: "not_recorded",
        },
      })
    ).toBe(false);
  });
});

describe("buildImpactRow", () => {
  it("maps learningApplied true and resolution recorded from frozen snapshot", () => {
    const row = buildImpactRow(
      makeEvaluatedRow({ outputLearningApplication: recordedApplication })
    );

    expect(row).toMatchObject({
      corpusItemId: "corpus-1",
      clientProfileId: "client-1",
      generationMode: "art_variation",
      format: "1:1",
      cohort: "baseline",
      learningApplied: true,
      applicationResolution: "recorded",
      visualScore: 72,
      factualPass: true,
      intent: "approve",
    });
  });

  it("maps legacy rows without application metadata to not_recorded and learningApplied false", () => {
    const row = buildImpactRow(makeEvaluatedRow({ generationMode: "art_variation" }));

    expect(row.learningApplied).toBe(false);
    expect(row.applicationResolution).toBe("not_recorded");
  });

  it("maps null qualitySnapshot to not_recorded and learningApplied false", () => {
    const row = buildImpactRow(makeEvaluatedRow(null));

    expect(row.learningApplied).toBe(false);
    expect(row.applicationResolution).toBe("not_recorded");
  });
});

describe("buildImpactSliceKey", () => {
  it("formats slice key as clientProfileId|generationMode|format", () => {
    expect(
      buildImpactSliceKey({
        clientProfileId: "client-1",
        generationMode: "art_variation",
        format: "1:1",
      })
    ).toBe("client-1|art_variation|1:1");
  });
});

describe("buildImpactRows", () => {
  it("maps batch of evaluated rows to impact rows", () => {
    const result = buildImpactRows([
      makeEvaluatedRow({ outputLearningApplication: recordedApplication }),
      makeEvaluatedRow({ generationMode: "restyling" }),
    ]);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].learningApplied).toBe(true);
    expect(result.rows[1].learningApplied).toBe(false);
  });

  it("tracks unlabeledCount for rows with not_recorded resolution", () => {
    const result = buildImpactRows([
      makeEvaluatedRow({ outputLearningApplication: recordedApplication }),
      makeEvaluatedRow({ generationMode: "restyling" }),
      makeEvaluatedRow(null),
    ]);

    expect(result.unlabeledCount).toBe(2);
  });
});
