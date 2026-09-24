import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DerivedOutputLearningDraft } from "../output-learning/types";

vi.mock("../db", () => ({
  db: { select: vi.fn(), transaction: vi.fn() },
}));

import { db } from "../db";
import { syncOutputLearningsForClient } from "./client-output-learning";

const draft = (value: string): DerivedOutputLearningDraft => ({
  variableKey: "cta",
  variableValue: value,
  scopeGenerationMode: "art_variation",
  scopeFormat: "1:1",
  preferenceDirection: "prefer",
  statement: `Use ${value}`,
  confidence: "high",
  confidenceScore: "0.9000",
  sampleEventCount: 3,
  sampleCampaignCount: 2,
  supportingEvidence: [],
  contradictingEvidence: [],
  lastEvidenceAt: null,
  status: "approved",
});

describe("syncOutputLearningsForClient batch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses one read, one removal, and one upsert per 100 unique drafts", async () => {
    const existing = [
      { ...draft("ITEM-0"), id: "old-0", status: "approved" },
      { ...draft("stale"), id: "stale", status: "draft" },
    ];
    const orderBy = vi.fn().mockResolvedValue(existing);
    vi.mocked(db.select).mockReturnValue({
      from: () => ({ where: () => ({ orderBy }) }),
    } as never);
    const removedRows = [{ ...existing[1], status: "removed" }];
    const updateReturning = vi.fn().mockResolvedValue(removedRows);
    const update = vi.fn().mockReturnValue({
      set: () => ({ where: () => ({ returning: updateReturning }) }),
    });
    const values = vi.fn().mockImplementation((batch) => ({
      onConflictDoUpdate: () => ({
        returning: async () => batch.map((payload: object, index: number) => ({
          ...payload,
          id: `learning-${index}`,
        })),
      }),
    }));
    const insert = vi.fn().mockReturnValue({ values });
    vi.mocked(db.transaction).mockImplementation(async (callback) =>
      callback({ update, insert } as never)
    );

    const drafts = Array.from({ length: 101 }, (_, index) => draft(`item-${index}`));
    drafts.push({ ...draft("ITEM-0"), statement: "latest" });
    const result = await syncOutputLearningsForClient({
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      drafts,
    });

    expect(db.select).toHaveBeenCalledTimes(1);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(values.mock.calls.map(([batch]) => batch.length)).toEqual([100, 1]);
    expect(values.mock.calls[0][0][0]).toMatchObject({
      variableValue: "ITEM-0",
      statement: "latest",
    });
    expect(result.upserted).toHaveLength(101);
    expect(result.upserted[0].statement).toBe("latest");
    expect(result.removed).toEqual(removedRows);
  });

  it("rejects the transaction when a later chunk fails", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: () => ({ where: () => ({ orderBy: async () => [] }) }),
    } as never);
    const returning = vi.fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("write failed"));
    const insert = vi.fn().mockReturnValue({
      values: () => ({ onConflictDoUpdate: () => ({ returning }) }),
    });
    vi.mocked(db.transaction).mockImplementation(async (callback) =>
      callback({ insert } as never)
    );

    await expect(syncOutputLearningsForClient({
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      drafts: Array.from({ length: 101 }, (_, index) => draft(`item-${index}`)),
    })).rejects.toThrow("write failed");
    expect(returning).toHaveBeenCalledTimes(2);
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });
});
