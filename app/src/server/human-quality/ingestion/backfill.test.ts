import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCorpusBackfillBatch } from "./backfill";

vi.mock("../auto-promote", () => ({ captureAndAutoPromote: vi.fn() }));
vi.mock("../../repositories/human-quality-ingestion", () => ({
  listEligibleDerivationsForBackfill: vi.fn(),
}));

import { captureAndAutoPromote } from "../auto-promote";
import { listEligibleDerivationsForBackfill } from "../../repositories/human-quality-ingestion";

const mockCapture = vi.mocked(captureAndAutoPromote);
const mockList = vi.mocked(listEligibleDerivationsForBackfill);
const workspaceId = "00000000-0000-4000-8000-000000000001";
const rows = Array.from({ length: 11 }, (_, index) => ({
  workspaceId,
  campaignId: `00000000-0000-4000-8001-${index.toString().padStart(12, "0")}`,
  derivationId: `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
  createdAt: new Date(Date.UTC(2026, 8, 1, 0, index)),
}));

describe("runCorpusBackfillBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue(rows);
  });

  it("limits concurrent capture while preserving counts and cursor", async () => {
    let active = 0;
    let maxActive = 0;
    mockCapture.mockImplementation(async ({ derivationId }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      if (derivationId === rows[0].derivationId) return { candidate: null, promoted: null };
      if (derivationId === rows[1].derivationId) {
        return { candidate: { id: derivationId }, promoted: null, promoteError: "client_consent_required" } as Awaited<ReturnType<typeof captureAndAutoPromote>>;
      }
      return { candidate: { id: derivationId }, promoted: { created: true } } as Awaited<ReturnType<typeof captureAndAutoPromote>>;
    });

    const result = await runCorpusBackfillBatch({ batchSize: 11 });
    expect(maxActive).toBe(5);
    expect(result).toEqual({
      processed: 11,
      created: 10,
      promoted: 9,
      skipped: 1,
      blocked: 1,
      nextCursor: { createdAt: rows[10].createdAt.toISOString(), id: rows[10].derivationId },
    });
  });

  it("waits for a failed chunk and lets the caller retry the original cursor", async () => {
    let failOnce = true;
    mockCapture.mockImplementation(async ({ derivationId }) => {
      if (derivationId === rows[2].derivationId && failOnce) {
        failOnce = false;
        throw new Error("temporary_database_error");
      }
      return { candidate: { id: derivationId }, promoted: { created: false } } as Awaited<ReturnType<typeof captureAndAutoPromote>>;
    });

    await expect(runCorpusBackfillBatch({ batchSize: 11 })).rejects.toThrow("temporary_database_error");
    expect(mockCapture).toHaveBeenCalledTimes(5);
    const result = await runCorpusBackfillBatch({ batchSize: 11 });
    expect(result.processed).toBe(11);
    expect(result.nextCursor?.id).toBe(rows[10].derivationId);
    expect(mockCapture).toHaveBeenCalledTimes(16);
  });

  it("serializes derivations sharing a campaign while processing other campaigns", async () => {
    mockList.mockResolvedValue(rows.map((row, index) => ({
      ...row,
      campaignId: index === 4 ? row.campaignId : rows[0].campaignId,
    })));
    let active = 0;
    let maxActive = 0;
    mockCapture.mockImplementation(async ({ derivationId }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return { candidate: { id: derivationId }, promoted: { created: false } } as Awaited<ReturnType<typeof captureAndAutoPromote>>;
    });

    await runCorpusBackfillBatch({ batchSize: 11 });
    expect(maxActive).toBe(2);
  });
});
