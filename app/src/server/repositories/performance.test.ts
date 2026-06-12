import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
  },
}));

import { db } from "../db";
import {
  getPerformanceSnapshotById,
  listPerformanceSnapshotsByCampaign,
  listPerformanceSnapshotsByDerivation,
  upsertPerformanceSnapshot,
} from "./performance";

const snapshot = {
  id: "snapshot-1",
  workspaceId: "workspace-1",
  clientProfileId: "client-1",
  campaignId: "campaign-1",
  derivationId: "derivation-1",
  platform: "meta",
  placement: "feed",
  placementRaw: "Instagram Feed",
  adAccountId: null,
  startDate: "2026-06-01",
  endDate: "2026-06-07",
  sourceTimezone: "America/Sao_Paulo",
  currency: "BRL",
  impressions: "1000",
  clicks: "25",
  spend: "50.25",
  conversions: "2.5",
  conversionValue: "201",
  sourceType: "manual",
  externalCampaignId: null,
  externalAdGroupId: null,
  externalAdId: null,
  sourceKey: "a".repeat(64),
  scopeKind: "total",
  scopeDimensions: null,
  sourceMetadata: null,
  createdByUserId: "user-1",
  createdAt: new Date("2026-06-12T00:00:00.000Z"),
  updatedAt: new Date("2026-06-12T00:00:00.000Z"),
};

describe("performance repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts atomically by workspace and source key", async () => {
    const returning = vi.fn().mockResolvedValue([snapshot]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    vi.mocked(db.insert).mockReturnValue({ values } as never);

    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } =
      snapshot;
    const result = await upsertPerformanceSnapshot(input);

    expect(result.id).toBe("snapshot-1");
    expect(values).toHaveBeenCalledWith(input);
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.any(Array) })
    );
  });

  it("scopes lookup by id to the workspace", async () => {
    const limit = vi.fn().mockResolvedValue([snapshot]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValue({ from } as never);

    const result = await getPerformanceSnapshotById(
      "snapshot-1",
      "workspace-1"
    );

    expect(result?.workspaceId).toBe("workspace-1");
    expect(where).toHaveBeenCalledOnce();
  });

  it.each([
    ["campaign", listPerformanceSnapshotsByCampaign],
    ["derivation", listPerformanceSnapshotsByDerivation],
  ])("lists %s snapshots inside a workspace", async (_label, list) => {
    const orderBy = vi.fn().mockResolvedValue([snapshot]);
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValue({ from } as never);

    const result = await list("entity-1", "workspace-1");

    expect(result).toEqual([snapshot]);
    expect(where).toHaveBeenCalledOnce();
    expect(orderBy).toHaveBeenCalled();
  });
});
