import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  },
}));

import { db } from "@/server/db";
import {
  acceptAdjustment,
  findAdjustmentById,
  listAcceptedAdjustments,
  supersedeAcceptedForSlice,
} from "@/server/repositories/rubric-calibration-adjustments";

const baseEvidence = {
  corpusItemIds: ["item-1", "item-2", "item-3"],
  sliceStats: {
    count: 3,
    meanSignedDelta: 18,
    meanAbsError: 18,
  },
  itemRefs: [
    { corpusItemId: "item-1", scoreDelta: 20 },
    { corpusItemId: "item-2", scoreDelta: 17 },
    { corpusItemId: "item-3", scoreDelta: 17 },
  ],
};

const proposedRow = {
  id: "adj-1",
  adjustmentVersion: "1.0.0",
  status: "proposed" as const,
  targetModule: "score_ceiling" as const,
  targetKey: "visual_overload",
  sliceKey: "visual_overload|art_variation|1:1",
  rationale: "Mean over-score +18 in slice",
  evidenceRefs: baseEvidence,
  proposedAt: new Date("2026-06-17"),
  acceptedAt: null,
  acceptedBy: null,
  changeSpec: null,
  createdAt: new Date("2026-06-17"),
};

function mockSelectChain(result: unknown) {
  const mockLimit = vi.fn().mockResolvedValue(Array.isArray(result) ? result : [result]);
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit, orderBy: vi.fn().mockResolvedValue(result) });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });
  return { mockWhere, mockLimit };
}

describe("rubric-calibration-adjustments accept lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("acceptAdjustment promotes proposed row with 3+ corpusItemIds to accepted with audit fields", async () => {
    mockSelectChain([proposedRow]);

    const mockReturning = vi.fn().mockResolvedValue([
      {
        ...proposedRow,
        status: "accepted",
        acceptedAt: new Date("2026-06-17T12:00:00Z"),
        acceptedBy: "reviewer-1",
        changeSpec: { ceilingDelta: -5 },
      },
    ]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

    const result = await acceptAdjustment({
      adjustmentId: "adj-1",
      reviewerUserId: "reviewer-1",
      changeSpec: { ceilingDelta: -5 },
    });

    expect(result.status).toBe("accepted");
    expect(result.acceptedBy).toBe("reviewer-1");
    expect(result.acceptedAt).toBeTruthy();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "accepted",
        acceptedBy: "reviewer-1",
        changeSpec: { ceilingDelta: -5 },
      })
    );
  });

  it("acceptAdjustment rejects row not in proposed status", async () => {
    mockSelectChain([{ ...proposedRow, status: "accepted" }]);

    await expect(
      acceptAdjustment({
        adjustmentId: "adj-1",
        reviewerUserId: "reviewer-1",
      })
    ).rejects.toMatchObject({ code: "adjustment_not_proposed" });
  });

  it("acceptAdjustment rejects when corpusItemIds length is below MIN_SLICE_SAMPLE", async () => {
    mockSelectChain([
      {
        ...proposedRow,
        evidenceRefs: {
          ...baseEvidence,
          corpusItemIds: ["item-1", "item-2"],
        },
      },
    ]);

    await expect(
      acceptAdjustment({
        adjustmentId: "adj-1",
        reviewerUserId: "reviewer-1",
      })
    ).rejects.toMatchObject({ code: "insufficient_evidence" });
  });

  it("supersedeAcceptedForSlice marks prior accepted rows as superseded", async () => {
    const mockReturning = vi.fn().mockResolvedValue([
      { id: "adj-old", status: "superseded" },
    ]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

    const rows = await supersedeAcceptedForSlice(
      "visual_overload|art_variation|1:1",
      "1.0.0",
      "score_ceiling",
      "visual_overload",
      "adj-new"
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("superseded");
    expect(mockSet).toHaveBeenCalledWith({ status: "superseded" });
  });

  it("listAcceptedAdjustments returns only accepted rows for adjustmentVersion", async () => {
    const mockOrderBy = vi.fn().mockResolvedValue([
      { id: "adj-1", status: "accepted", adjustmentVersion: "1.1.0" },
    ]);
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const rows = await listAcceptedAdjustments({ adjustmentVersion: "1.1.0" });

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("accepted");
    expect(mockWhere).toHaveBeenCalled();
  });

  it("findAdjustmentById returns row by id", async () => {
    mockSelectChain([proposedRow]);

    const row = await findAdjustmentById("adj-1");

    expect(row?.id).toBe("adj-1");
  });
});
