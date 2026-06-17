import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
  },
}));

import { db } from "@/server/db";
import {
  insertProposedAdjustment,
  listProposedAdjustments,
} from "@/server/repositories/rubric-calibration-adjustments";

describe("rubric-calibration-adjustments repository", () => {
  const baseInput = {
    adjustmentVersion: "1.0.0",
    targetModule: "score_ceiling" as const,
    targetKey: "visual_overload",
    sliceKey: "visual_overload|art_variation|1:1",
    rationale: "Mean over-score +18 in slice; current ceiling 55",
    evidenceRefs: {
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
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("insertProposedAdjustment persists status proposed with adjustmentVersion and evidence JSON", async () => {
    const mockReturning = vi.fn().mockResolvedValue([
      {
        id: "adj-1",
        status: "proposed",
        ...baseInput,
        proposedAt: new Date("2026-06-17"),
        createdAt: new Date("2026-06-17"),
      },
    ]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const result = await insertProposedAdjustment(baseInput);

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        adjustmentVersion: "1.0.0",
        status: "proposed",
        targetModule: "score_ceiling",
        targetKey: "visual_overload",
        sliceKey: baseInput.sliceKey,
        evidenceRefs: baseInput.evidenceRefs,
      })
    );
    expect(result.status).toBe("proposed");
    expect(result.id).toBe("adj-1");
  });

  it("listProposedAdjustments filters by adjustmentVersion and status", async () => {
    const mockOrderBy = vi.fn().mockResolvedValue([
      { id: "adj-1", status: "proposed", adjustmentVersion: "1.0.0" },
    ]);
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const rows = await listProposedAdjustments({
      adjustmentVersion: "1.0.0",
      status: "proposed",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("proposed");
    expect(mockWhere).toHaveBeenCalled();
  });

  it("evidence JSON contains corpusItemIds, slice stats, and per-item scoreDelta refs", async () => {
    const mockReturning = vi.fn().mockResolvedValue([
      {
        id: "adj-1",
        status: "proposed",
        evidenceRefs: baseInput.evidenceRefs,
      },
    ]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const result = await insertProposedAdjustment(baseInput);

    expect(result.evidenceRefs.corpusItemIds).toEqual(["item-1", "item-2", "item-3"]);
    expect(result.evidenceRefs.sliceStats.meanSignedDelta).toBe(18);
    expect(result.evidenceRefs.itemRefs).toHaveLength(3);
    expect(result.evidenceRefs.itemRefs[0]).toEqual({
      corpusItemId: "item-1",
      scoreDelta: 20,
    });
  });
});
