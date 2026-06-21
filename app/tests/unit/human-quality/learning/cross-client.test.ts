import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/server/repositories/calibration-rule", () => ({
  listApprovedCorpusQualityRules: vi.fn(),
}));

vi.mock("@/server/repositories/human-quality-corpus", () => ({
  listEvaluatedCorpusWithEvaluations: vi.fn(),
}));

vi.mock("@/server/human-quality/calibration/service", () => ({
  persistProposedAdjustments: vi.fn(),
}));

import { listApprovedCorpusQualityRules } from "@/server/repositories/calibration-rule";
import { listEvaluatedCorpusWithEvaluations } from "@/server/repositories/human-quality-corpus";
import { persistProposedAdjustments } from "@/server/human-quality/calibration/service";
import {
  detectAndPersistCrossClientGlobalProposals,
  extractPrimaryFailureReasonFromRationale,
} from "@/server/human-quality/learning/cross-client";
import type { CalibrationRule } from "@/server/db/schema";

const mockListApprovedRules = vi.mocked(listApprovedCorpusQualityRules);
const mockListEvaluated = vi.mocked(listEvaluatedCorpusWithEvaluations);
const mockPersistProposed = vi.mocked(persistProposedAdjustments);

function makeApprovedRule(
  overrides: Partial<CalibrationRule> & {
    clientProfileId: string;
    rationale: string;
  }
): CalibrationRule {
  return {
    id: `rule-${overrides.clientProfileId}`,
    workspaceId: "ws-1",
    category: "corpus_quality",
    status: "approved",
    supportingSignalIds: [],
    confidence: "medium",
    caveats: [],
    mismatchBucket: null,
    version: 1,
    approvedAt: new Date("2026-06-17"),
    approvedBy: "reviewer-1",
    createdAt: new Date("2026-06-17"),
    updatedAt: new Date("2026-06-17"),
    ...overrides,
  } as CalibrationRule;
}

function makeEvaluatedRow(input: {
  id: string;
  clientProfileId: string;
  scoreDelta: number;
  primaryFailureReason?: string;
}) {
  const humanVisualScore = 80 - input.scoreDelta;
  return {
    item: {
      id: input.id,
      workspaceId: "ws-1",
      clientProfileId: input.clientProfileId,
      derivationId: `deriv-${input.id}`,
      generationMode: "art_variation",
      format: "1:1",
      cohort: "baseline",
      status: "evaluated",
      qualitySnapshot: { qualityScore: 80, qualityVerdict: "pass", hardFailures: [] },
    },
    evaluation: {
      id: `eval-${input.id}`,
      corpusItemId: input.id,
      visualScore: humanVisualScore,
      factualPass: true,
      primaryFailureReason: input.primaryFailureReason ?? "illegible_cta",
    },
  };
}

describe("extractPrimaryFailureReasonFromRationale", () => {
  it("parses failure reason prefix stored on proposal accept", () => {
    expect(
      extractPrimaryFailureReasonFromRationale(
        "illegible_cta: CTA must be legible at thumbnail size"
      )
    ).toBe("illegible_cta");
  });

  it("returns null when rationale has no prefix separator", () => {
    expect(extractPrimaryFailureReasonFromRationale("no-prefix-here")).toBeNull();
  });
});

describe("detectAndPersistCrossClientGlobalProposals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPersistProposed.mockResolvedValue([]);
  });

  it("promotes to global when 2+ clients have approved corpus_quality rules for same failure", async () => {
    mockListApprovedRules.mockResolvedValue([
      makeApprovedRule({
        clientProfileId: "client-a",
        rationale: "illegible_cta: CTA must be legible at thumbnail size",
      }),
      makeApprovedRule({
        clientProfileId: "client-b",
        rationale: "illegible_cta: CTA must be legible at thumbnail size",
      }),
    ]);

    mockListEvaluated.mockResolvedValue([
      ...Array.from({ length: 3 }, (_, index) =>
        makeEvaluatedRow({
          id: `a-${index + 1}`,
          clientProfileId: "client-a",
          scoreDelta: 18,
        })
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        makeEvaluatedRow({
          id: `b-${index + 1}`,
          clientProfileId: "client-b",
          scoreDelta: 16,
        })
      ),
    ]);

    const persistedProposal = {
      adjustmentVersion: "1.1.0",
      status: "proposed" as const,
      targetModule: "score_ceiling" as const,
      targetKey: "illegible_cta",
      sliceKey: "illegible_cta|art_variation|1:1",
      rationale: "cross-client proposal",
      evidenceRefs: {
        corpusItemIds: ["a-1", "a-2", "a-3", "b-1", "b-2", "b-3"],
        sliceStats: { count: 6, meanSignedDelta: 17, meanAbsError: 17 },
        itemRefs: [],
      },
    };
    mockPersistProposed.mockResolvedValue([persistedProposal]);

    const result = await detectAndPersistCrossClientGlobalProposals();

    expect(result).toHaveLength(1);
    expect(result[0].targetKey).toBe("illegible_cta");
    expect(mockListEvaluated).toHaveBeenCalledWith({
      primaryFailureReason: "illegible_cta",
    });
    expect(mockPersistProposed).toHaveBeenCalledOnce();
  });

  it("skips when fewer than 2 distinct clients have approved rules", async () => {
    mockListApprovedRules.mockResolvedValue([
      makeApprovedRule({
        clientProfileId: "client-a",
        rationale: "illegible_cta: CTA must be legible at thumbnail size",
      }),
    ]);

    const result = await detectAndPersistCrossClientGlobalProposals();

    expect(result).toEqual([]);
    expect(mockListEvaluated).not.toHaveBeenCalled();
    expect(mockPersistProposed).not.toHaveBeenCalled();
  });

  it("skips when cross-client evaluations are below threshold", async () => {
    mockListApprovedRules.mockResolvedValue([
      makeApprovedRule({
        clientProfileId: "client-a",
        rationale: "visual_overload: Reduce visual clutter",
      }),
      makeApprovedRule({
        clientProfileId: "client-b",
        rationale: "visual_overload: Reduce visual clutter",
      }),
    ]);

    mockListEvaluated.mockResolvedValue([
      makeEvaluatedRow({
        id: "a-1",
        clientProfileId: "client-a",
        scoreDelta: 18,
        primaryFailureReason: "visual_overload",
      }),
      makeEvaluatedRow({
        id: "b-1",
        clientProfileId: "client-b",
        scoreDelta: 16,
        primaryFailureReason: "visual_overload",
      }),
    ]);

    const result = await detectAndPersistCrossClientGlobalProposals();

    expect(result).toEqual([]);
    expect(mockPersistProposed).not.toHaveBeenCalled();
  });

  it("skips when aggregate meanSignedDelta is below divergence threshold", async () => {
    mockListApprovedRules.mockResolvedValue([
      makeApprovedRule({
        clientProfileId: "client-a",
        rationale: "visual_overload: Reduce visual clutter",
      }),
      makeApprovedRule({
        clientProfileId: "client-b",
        rationale: "visual_overload: Reduce visual clutter",
      }),
    ]);

    mockListEvaluated.mockResolvedValue(
      Array.from({ length: 6 }, (_, index) =>
        makeEvaluatedRow({
          id: `item-${index + 1}`,
          clientProfileId: index < 3 ? "client-a" : "client-b",
          scoreDelta: 10,
          primaryFailureReason: "visual_overload",
        })
      )
    );

    const result = await detectAndPersistCrossClientGlobalProposals();

    expect(result).toEqual([]);
    expect(mockPersistProposed).not.toHaveBeenCalled();
  });
});
