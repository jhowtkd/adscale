import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  },
}));

import { db } from "../db";
import {
  createPerformanceImportBatch,
  createPerformanceImportRow,
  getPerformanceImportBatchById,
  listPerformanceImportBatchesByCampaign,
  listPerformanceImportRowsByBatch,
  updatePerformanceImportBatchCounts,
} from "./performance-import";

const batch = {
  id: "batch-1",
  workspaceId: "workspace-1",
  campaignId: "campaign-1",
  sourceType: "csv",
  fileName: "results.csv",
  fileHash: "abc123",
  columnMapping: { derivationId: "derivation_id" },
  parseOptions: { defaultCurrency: "BRL" },
  createdCount: 1,
  updatedCount: 0,
  ignoredCount: 0,
  invalidCount: 0,
  createdByUserId: "user-1",
  createdAt: new Date("2026-06-12T00:00:00.000Z"),
};

const row = {
  id: "row-1",
  batchId: "batch-1",
  rowIndex: 0,
  status: "created",
  errors: null,
  snapshotId: "snapshot-1",
  sourceKey: "a".repeat(64),
};

describe("performance-import repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates import batches", async () => {
    const returning = vi.fn().mockResolvedValue([batch]);
    const values = vi.fn().mockReturnValue({ returning });
    vi.mocked(db.insert).mockReturnValue({ values } as never);

    const result = await createPerformanceImportBatch({
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      sourceType: "csv",
      createdByUserId: "user-1",
    });

    expect(result.id).toBe("batch-1");
  });

  it("updates batch counts", async () => {
    const returning = vi.fn().mockResolvedValue([batch]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    vi.mocked(db.update).mockReturnValue({ set } as never);

    const result = await updatePerformanceImportBatchCounts("batch-1", {
      createdCount: 2,
      updatedCount: 1,
      ignoredCount: 0,
      invalidCount: 1,
    });

    expect(result.createdCount).toBe(1);
    expect(set).toHaveBeenCalled();
  });

  it("creates import rows", async () => {
    const returning = vi.fn().mockResolvedValue([row]);
    const values = vi.fn().mockReturnValue({ returning });
    vi.mocked(db.insert).mockReturnValue({ values } as never);

    const result = await createPerformanceImportRow({
      batchId: "batch-1",
      rowIndex: 0,
      status: "created",
      snapshotId: "snapshot-1",
      sourceKey: "a".repeat(64),
    });

    expect(result.status).toBe("created");
  });

  it("lists batches scoped to workspace and campaign", async () => {
    const orderBy = vi.fn().mockResolvedValue([batch]);
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValue({ from } as never);

    const result = await listPerformanceImportBatchesByCampaign(
      "campaign-1",
      "workspace-1"
    );

    expect(result).toEqual([batch]);
  });

  it("loads batch detail by id within workspace", async () => {
    const limit = vi.fn().mockResolvedValue([batch]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValue({ from } as never);

    const result = await getPerformanceImportBatchById(
      "batch-1",
      "workspace-1"
    );

    expect(result?.workspaceId).toBe("workspace-1");
  });

  it("lists rows for a batch ordered by index", async () => {
    const orderBy = vi.fn().mockResolvedValue([row]);
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValue({ from } as never);

    const result = await listPerformanceImportRowsByBatch("batch-1");

    expect(result).toEqual([row]);
    expect(orderBy).toHaveBeenCalled();
  });
});
