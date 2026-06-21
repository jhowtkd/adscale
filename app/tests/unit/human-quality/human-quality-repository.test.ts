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
  insertCorpusItem,
  listCorpusQueueItems,
  listPendingCorpusItems,
  submitCorpusEvaluation,
} from "@/server/repositories/human-quality-corpus";

describe("human-quality-corpus repository", () => {
  const workspaceA = "ws-a";
  const workspaceB = "ws-b";

  const baseItem = {
    workspaceId: workspaceA,
    clientProfileId: "profile-1",
    campaignId: "camp-1",
    derivationId: "deriv-1",
    generationMode: "art_variation",
    format: "1:1",
    cohort: "baseline" as const,
    corpusVersion: 1,
    artifactRef: { derivationId: "deriv-1", assetId: "asset-1" },
    qualitySnapshot: { generationMode: "art_variation", qualityScore: 70 },
    selectedByUserId: "user-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("insertCorpusItem persists pending corpus row", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "item-1", status: "pending", ...baseItem }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const result = await insertCorpusItem(baseItem);

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: workspaceA,
        derivationId: "deriv-1",
        cohort: "baseline",
        status: "pending",
      })
    );
    expect(result.id).toBe("item-1");
    expect(result.status).toBe("pending");
  });

  it("listPendingCorpusItems scopes by workspace", async () => {
    const mockLimit = vi.fn().mockResolvedValue([
      {
        item: { id: "item-1", workspaceId: workspaceA, selectedAt: new Date() },
        sourceLabel: "operator_imported",
      },
    ]);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere });
    const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const rows = await listPendingCorpusItems({ workspaceId: workspaceA, limit: 20 });

    expect(rows).toHaveLength(1);
    expect(rows[0].workspaceId).toBe(workspaceA);
    expect(mockLimit).toHaveBeenCalledWith(20);
  });

  it("listPendingCorpusItems does not return other workspace rows", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere });
    const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const rows = await listPendingCorpusItems({ workspaceId: workspaceB });

    expect(rows).toEqual([]);
  });

  it("listCorpusQueueItems returns nextCursor when page is full", async () => {
    const selectedAt = new Date("2026-06-17T10:00:00.000Z");
    const mockLimit = vi.fn().mockResolvedValue([
      {
        item: { id: "item-2", selectedAt, status: "pending" },
        sourceLabel: "operator_imported",
      },
      {
        item: { id: "item-1", selectedAt: new Date("2026-06-16T10:00:00.000Z"), status: "pending" },
        sourceLabel: "real_customer",
      },
    ]);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere });
    const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const result = await listCorpusQueueItems({ limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toEqual({
      selectedAt: new Date("2026-06-16T10:00:00.000Z").toISOString(),
      id: "item-1",
    });
  });

  it("listCorpusQueueItems returns null nextCursor when page is partial", async () => {
    const mockLimit = vi.fn().mockResolvedValue([
      {
        item: { id: "item-1", selectedAt: new Date(), status: "pending" },
        sourceLabel: "operator_imported",
      },
    ]);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere });
    const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const result = await listCorpusQueueItems({ limit: 2 });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("submitCorpusEvaluation inserts evaluation and marks item evaluated", async () => {
    const mockEvalReturning = vi.fn().mockResolvedValue([
      {
        id: "eval-1",
        corpusItemId: "item-1",
        visualScore: 82,
        factualPass: true,
        intent: "approve",
        primaryFailureReason: "other",
      },
    ]);
    const mockEvalValues = vi.fn().mockReturnValue({ returning: mockEvalReturning });
    const mockItemReturning = vi.fn().mockResolvedValue([{ id: "item-1", status: "evaluated" }]);
    const mockItemWhere = vi.fn().mockReturnValue({ returning: mockItemReturning });
    const mockItemSet = vi.fn().mockReturnValue({ where: mockItemWhere });

    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockEvalValues });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockItemSet });

    const result = await submitCorpusEvaluation({
      workspaceId: workspaceA,
      corpusItemId: "item-1",
      reviewerUserId: "reviewer-1",
      visualScore: 82,
      factualPass: true,
      intent: "approve",
      primaryFailureReason: "other",
    });

    expect(mockEvalValues).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: workspaceA,
        corpusItemId: "item-1",
        visualScore: 82,
        factualPass: true,
        intent: "approve",
      })
    );
    expect(mockItemSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "evaluated",
      })
    );
    expect(result.evaluation.id).toBe("eval-1");
    expect(result.item.status).toBe("evaluated");
  });
});
