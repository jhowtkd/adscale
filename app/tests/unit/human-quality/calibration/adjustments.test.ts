import { describe, it, expect, vi } from "vitest";

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
    expect(proposals[0].adjustmentVersion).toBe("1.1.0");
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

describe("runScoreCalibration orchestrator", () => {
  it("produces complete CalibrationReport with persisted proposed adjustments", async () => {
    vi.resetModules();

    const evaluatedRows = Array.from({ length: 5 }, (_, index) => ({
      item: {
        id: `item-${index + 1}`,
        workspaceId: "ws-1",
        derivationId: `deriv-${index + 1}`,
        generationMode: "art_variation",
        format: "1:1",
        cohort: "baseline",
        status: "evaluated",
        qualitySnapshot: { qualityScore: 80, qualityVerdict: "pass", hardFailures: [] },
      },
      evaluation: {
        id: `eval-${index + 1}`,
        corpusItemId: `item-${index + 1}`,
        visualScore: 62,
        factualPass: true,
        primaryFailureReason: "visual_overload",
      },
    }));

    vi.doMock("@/server/repositories/human-quality-corpus", () => ({
      listEvaluatedCorpusWithEvaluations: vi
        .fn()
        .mockResolvedValue(evaluatedRows),
    }));

    vi.doMock("@/server/repositories/rubric-calibration-adjustments", () => ({
      listExistingAdjustmentKeys: vi.fn().mockResolvedValue([]),
      insertProposedAdjustments: vi.fn().mockImplementation(async (inputs) => inputs.map((input) => ({
        id: "adj-new",
        status: "proposed",
        ...input,
        proposedAt: new Date("2026-06-17"),
        createdAt: new Date("2026-06-17"),
      }))),
      listProposedAdjustments: vi.fn().mockResolvedValue([
        {
          id: "adj-new",
          status: "proposed",
          adjustmentVersion: "1.1.0",
          targetModule: "visual_scoring",
          targetKey: "visual_overload",
          rationale: "Reduce visual overload tolerance",
          evidenceRefs: { corpusItemIds: ["item-1", "item-2", "item-3"] },
          proposedAt: new Date("2026-06-17"),
          createdAt: new Date("2026-06-17"),
        },
      ]),
    }));

    const { runScoreCalibration } = await import(
      "@/server/human-quality/calibration/service"
    );
    const adjustmentsRepo = await import(
      "@/server/repositories/rubric-calibration-adjustments"
    );

    const result = await runScoreCalibration({
      workspaceId: "ws-1",
      capturedAt: "2026-06-17T12:00:00.000Z",
    });

    expect(result.report.schemaVersion).toBe(1);
    expect(result.report.status).toBe("ok");
    expect(result.report.evaluatedItemCount).toBe(5);
    expect(result.report.adjustments.length).toBeGreaterThan(0);
    expect(result.persistedAdjustments.length).toBeGreaterThan(0);
    expect(adjustmentsRepo.insertProposedAdjustments).toHaveBeenCalledTimes(1);
  });

  it("skips persistence when identical proposal already exists for slice and version", async () => {
    vi.resetModules();

    const evaluatedRows = Array.from({ length: 5 }, (_, index) => ({
      item: {
        id: `item-${index + 1}`,
        workspaceId: "ws-1",
        derivationId: `deriv-${index + 1}`,
        generationMode: "art_variation",
        format: "1:1",
        cohort: "baseline",
        status: "evaluated",
        qualitySnapshot: { qualityScore: 80, qualityVerdict: "pass", hardFailures: [] },
      },
      evaluation: {
        id: `eval-${index + 1}`,
        corpusItemId: `item-${index + 1}`,
        visualScore: 62,
        factualPass: true,
        primaryFailureReason: "visual_overload",
      },
    }));

    vi.doMock("@/server/repositories/human-quality-corpus", () => ({
      listEvaluatedCorpusWithEvaluations: vi
        .fn()
        .mockResolvedValue(evaluatedRows),
    }));

    vi.doMock("@/server/repositories/rubric-calibration-adjustments", () => ({
      listExistingAdjustmentKeys: vi.fn().mockResolvedValue([{
        adjustmentVersion: "1.1.0",
        targetModule: "score_ceiling",
        targetKey: "visual_overload",
        sliceKey: "visual_overload|art_variation|1:1",
      }]),
      insertProposedAdjustments: vi.fn(),
      listProposedAdjustments: vi.fn().mockResolvedValue([
        {
          id: "adj-existing",
          status: "proposed",
          adjustmentVersion: "1.1.0",
          targetModule: "visual_scoring",
          targetKey: "visual_overload",
          rationale: "Existing proposal",
          evidenceRefs: { corpusItemIds: ["item-1", "item-2", "item-3"] },
          proposedAt: new Date("2026-06-17"),
          createdAt: new Date("2026-06-17"),
        },
      ]),
    }));

    const { runScoreCalibration } = await import(
      "@/server/human-quality/calibration/service"
    );
    const adjustmentsRepo = await import(
      "@/server/repositories/rubric-calibration-adjustments"
    );

    const result = await runScoreCalibration({ workspaceId: "ws-1" });

    expect(result.report.adjustments.length).toBeGreaterThan(0);
    expect(result.persistedAdjustments).toEqual([]);
    expect(adjustmentsRepo.insertProposedAdjustments).not.toHaveBeenCalled();
  });
});

describe("persistProposedAdjustments batch", () => {
  it("reads once, removes duplicate identities, and returns only inserted proposals", async () => {
    vi.resetModules();
    const [first] = proposeAdjustments([
      makeComparison({ id: "item-1" }),
      makeComparison({ id: "item-2" }),
      makeComparison({ id: "item-3" }),
    ]);
    const second = { ...first, targetKey: "other" };
    const third = { ...first, sliceKey: "other-slice" };
    const listExistingAdjustmentKeys = vi.fn().mockResolvedValue([first]);
    const insertProposedAdjustments = vi.fn().mockResolvedValue([third]);
    vi.doMock("@/server/repositories/rubric-calibration-adjustments", () => ({
      listExistingAdjustmentKeys,
      insertProposedAdjustments,
    }));

    const { persistProposedAdjustments } = await import(
      "@/server/human-quality/calibration/service"
    );
    const persisted = await persistProposedAdjustments([first, second, second, third]);

    expect(listExistingAdjustmentKeys).toHaveBeenCalledTimes(1);
    expect(insertProposedAdjustments).toHaveBeenCalledOnce();
    expect(insertProposedAdjustments).toHaveBeenCalledWith([second, third]);
    expect(persisted).toEqual([third]);
  });
});
