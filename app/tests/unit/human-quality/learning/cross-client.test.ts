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
  sourceLabel?: "synthetic_fixture" | "real_customer" | "operator_imported";
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
    sourceLabel: input.sourceLabel,
  };
}

function setupCrossClientPromotionMocks(input?: {
  ruleIds?: { clientA: string; clientB: string };
  sourceLabels?: Array<"synthetic_fixture" | "real_customer" | "operator_imported">;
}) {
  const ruleIdA = input?.ruleIds?.clientA ?? "rule-client-a";
  const ruleIdB = input?.ruleIds?.clientB ?? "rule-client-b";

  mockListApprovedRules.mockResolvedValue([
    makeApprovedRule({
      id: ruleIdA,
      clientProfileId: "client-a",
      rationale: "illegible_cta: CTA must be legible at thumbnail size",
    }),
    makeApprovedRule({
      id: ruleIdB,
      clientProfileId: "client-b",
      rationale: "illegible_cta: CTA must be legible at thumbnail size",
    }),
  ]);

  const defaultSourceLabels: Array<
    "synthetic_fixture" | "real_customer" | "operator_imported"
  > = Array.from({ length: 6 }, () => "synthetic_fixture");
  const sourceLabels = input?.sourceLabels ?? defaultSourceLabels;

  mockListEvaluated.mockResolvedValue([
    ...Array.from({ length: 3 }, (_, index) =>
      makeEvaluatedRow({
        id: `a-${index + 1}`,
        clientProfileId: "client-a",
        scoreDelta: 18,
        sourceLabel: sourceLabels[index],
      })
    ),
    ...Array.from({ length: 3 }, (_, index) =>
      makeEvaluatedRow({
        id: `b-${index + 1}`,
        clientProfileId: "client-b",
        scoreDelta: 16,
        sourceLabel: sourceLabels[index + 3],
      })
    ),
  ]);

  return { ruleIdA, ruleIdB };
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
    setupCrossClientPromotionMocks();

    mockPersistProposed.mockImplementation(async (proposals) => proposals);

    const result = await detectAndPersistCrossClientGlobalProposals();

    expect(result).toHaveLength(1);
    expect(result[0].targetKey).toBe("unreadable_required_text");
    expect(mockListEvaluated).toHaveBeenCalledWith({
      primaryFailureReason: "illegible_cta",
    });
    expect(mockPersistProposed).toHaveBeenCalledOnce();
  });

  it("sets fixtureOnly true when all supporting evaluations are synthetic_fixture", async () => {
    setupCrossClientPromotionMocks();
    mockPersistProposed.mockImplementation(async (proposals) => proposals);

    await detectAndPersistCrossClientGlobalProposals();

    const persistedProposals = mockPersistProposed.mock.calls[0][0];
    expect(persistedProposals[0].evidenceRefs.fixtureOnly).toBe(true);
  });

  it("sets fixtureOnly false when any supporting evaluation is real_customer", async () => {
    setupCrossClientPromotionMocks({
      sourceLabels: [
        "synthetic_fixture",
        "synthetic_fixture",
        "real_customer",
        "synthetic_fixture",
        "synthetic_fixture",
        "synthetic_fixture",
      ],
    });
    mockPersistProposed.mockImplementation(async (proposals) => proposals);

    await detectAndPersistCrossClientGlobalProposals();

    const persistedProposals = mockPersistProposed.mock.calls[0][0];
    expect(persistedProposals[0].evidenceRefs.fixtureOnly).toBe(false);
  });

  it("populates supportingClientRuleIds with every approved rule for the failure reason", async () => {
    const { ruleIdA, ruleIdB } = setupCrossClientPromotionMocks({
      ruleIds: { clientA: "rule-a-uuid", clientB: "rule-b-uuid" },
    });
    mockPersistProposed.mockImplementation(async (proposals) => proposals);

    await detectAndPersistCrossClientGlobalProposals();

    const persistedProposals = mockPersistProposed.mock.calls[0][0];
    expect(persistedProposals[0].evidenceRefs.supportingClientRuleIds).toEqual([
      ruleIdA,
      ruleIdB,
    ]);
  });

  it("tags persisted proposals with promotionSource cross_client", async () => {
    setupCrossClientPromotionMocks();
    mockPersistProposed.mockImplementation(async (proposals) => proposals);

    await detectAndPersistCrossClientGlobalProposals();

    const persistedProposals = mockPersistProposed.mock.calls[0][0];
    expect(persistedProposals[0].evidenceRefs.promotionSource).toBe("cross_client");
    expect(persistedProposals[0].evidenceRefs.primaryFailureReason).toBe("illegible_cta");
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
