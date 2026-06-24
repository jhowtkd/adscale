import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/repositories/rubric-calibration-adjustments", () => ({
  acceptAdjustment: vi.fn(),
  supersedeAcceptedForSlice: vi.fn(),
  listAcceptedAdjustments: vi.fn(),
  findAdjustmentById: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    transaction: vi.fn((callback: () => Promise<unknown>) => callback()),
  },
}));

import {
  acceptAdjustment,
  findAdjustmentById,
  listAcceptedAdjustments,
  supersedeAcceptedForSlice,
} from "@/server/repositories/rubric-calibration-adjustments";
import { acceptProposedAdjustment } from "@/server/human-quality/improvement/accept";
import {
  buildApplyPlan,
  computeBoundedCeiling,
} from "@/server/human-quality/improvement/apply";
import { TARGETED_VISUAL_FAILURE_REASONS } from "@/server/human-quality/improvement/types";

const mockAccept = vi.mocked(acceptAdjustment);
const mockSupersede = vi.mocked(supersedeAcceptedForSlice);
const mockListAccepted = vi.mocked(listAcceptedAdjustments);
const mockFindById = vi.mocked(findAdjustmentById);

const baseEvidence = {
  corpusItemIds: ["item-1", "item-2", "item-3"],
  sliceStats: { count: 3, meanSignedDelta: 18, meanAbsError: 18 },
  itemRefs: [
    { corpusItemId: "item-1", scoreDelta: 20 },
    { corpusItemId: "item-2", scoreDelta: 17 },
    { corpusItemId: "item-3", scoreDelta: 17 },
  ],
};

const acceptedVisualRow = {
  id: "adj-visual",
  adjustmentVersion: "1.1.0",
  status: "accepted" as const,
  targetModule: "score_ceiling" as const,
  targetKey: "visual_overload",
  sliceKey: "visual_overload|art_variation|1:1",
  rationale: "Over-score slice",
  evidenceRefs: baseEvidence,
  proposedAt: new Date("2026-06-17"),
  acceptedAt: new Date("2026-06-17"),
  acceptedBy: "reviewer-1",
  changeSpec: { ceilingDelta: -5 },
  createdAt: new Date("2026-06-17"),
};

const proposedRow = {
  ...acceptedVisualRow,
  id: "adj-proposed",
  status: "proposed" as const,
  acceptedAt: null,
  acceptedBy: null,
  changeSpec: null,
};

describe("acceptProposedAdjustment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindById.mockResolvedValue(proposedRow);
    mockSupersede.mockResolvedValue([]);
    mockAccept.mockResolvedValue(acceptedVisualRow);
  });

  it("supersedes prior accepted rows then accepts in repository order", async () => {
    mockAccept.mockResolvedValueOnce(proposedRow as typeof acceptedVisualRow);

    await acceptProposedAdjustment({
      adjustmentId: "adj-proposed",
      reviewerUserId: "reviewer-1",
      changeSpec: { ceilingDelta: -3 },
    });

    expect(mockSupersede).toHaveBeenCalledWith(
      proposedRow.sliceKey,
      proposedRow.adjustmentVersion,
      proposedRow.targetModule,
      proposedRow.targetKey,
      "adj-proposed"
    );
    expect(mockAccept).toHaveBeenCalledWith({
      adjustmentId: "adj-proposed",
      reviewerUserId: "reviewer-1",
      changeSpec: { ceilingDelta: -3 },
    });
  });

  it("throws insufficient_acknowledgment for cross_client fixtureOnly without ack", async () => {
    mockFindById.mockResolvedValue({
      ...proposedRow,
      evidenceRefs: {
        ...baseEvidence,
        fixtureOnly: true,
        promotionSource: "cross_client",
        supportingClientRuleIds: ["rule-a", "rule-b"],
      },
    });

    await expect(
      acceptProposedAdjustment({
        adjustmentId: "adj-proposed",
        reviewerUserId: "reviewer-1",
      })
    ).rejects.toMatchObject({ code: "insufficient_acknowledgment" });

    expect(mockAccept).not.toHaveBeenCalled();
  });

  it("accepts cross_client fixtureOnly proposal when acknowledgeFixtureOnly is true", async () => {
    mockFindById.mockResolvedValue({
      ...proposedRow,
      evidenceRefs: {
        ...baseEvidence,
        fixtureOnly: true,
        promotionSource: "cross_client",
        supportingClientRuleIds: ["rule-a", "rule-b"],
      },
    });

    const result = await acceptProposedAdjustment({
      adjustmentId: "adj-proposed",
      reviewerUserId: "reviewer-1",
      acknowledgeFixtureOnly: true,
    });

    expect(result.status).toBe("accepted");
    expect(mockAccept).toHaveBeenCalled();
  });
});

describe("buildApplyPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes only accepted rows with corpusItemIds.length >= 3", async () => {
    mockListAccepted.mockResolvedValue([
      acceptedVisualRow,
      {
        ...acceptedVisualRow,
        id: "adj-low-evidence",
        evidenceRefs: {
          ...baseEvidence,
          corpusItemIds: ["item-1"],
        },
      },
      {
        ...proposedRow,
        id: "adj-still-proposed",
      },
    ] as never);

    const plan = await buildApplyPlan("1.1.0");

    expect(plan).toHaveLength(1);
    expect(plan[0].adjustmentId).toBe("adj-visual");
  });

  it("maps slice failure reason via resolveAdjustmentTarget gate targets", async () => {
    mockListAccepted.mockResolvedValue([acceptedVisualRow]);

    const plan = await buildApplyPlan("1.1.0");

    expect(plan[0].primaryFailureReason).toBe("visual_overload");
    expect(plan[0].targetModule).toBe("score_ceiling");
    expect(plan[0].targetKey).toBe("visual_overload");
    expect(plan[0].gateTargets).toContain("visual_overload");
    expect(plan[0].applyKind).toBe("full");
  });

  it("flags factual_issue rows as factual_guard_only", async () => {
    mockListAccepted.mockResolvedValue([
      {
        ...acceptedVisualRow,
        id: "adj-factual",
        sliceKey: "factual_issue|art_variation|1:1",
        targetModule: "gate_classifier",
        targetKey: "product_mismatch",
      },
    ]);

    const plan = await buildApplyPlan("1.1.0");

    expect(plan[0].applyKind).toBe("factual_guard_only");
    expect(plan[0].primaryFailureReason).toBe("factual_issue");
  });

  it("exports five targeted visual failure reasons", () => {
    expect(TARGETED_VISUAL_FAILURE_REASONS).toHaveLength(5);
    expect(TARGETED_VISUAL_FAILURE_REASONS).toContain("illegible_cta");
  });
});

describe("computeBoundedCeiling", () => {
  it("clamps delta to ±5 and result to [0, 100]", () => {
    expect(computeBoundedCeiling(60, -5)).toBe(55);
    expect(computeBoundedCeiling(60, -99)).toBe(55);
    expect(computeBoundedCeiling(3, -5)).toBe(0);
    expect(computeBoundedCeiling(98, 5)).toBe(100);
    expect(computeBoundedCeiling(98, 99)).toBe(100);
  });
});
