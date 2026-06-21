import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/human-quality-ingestion", () => ({
  listEligibleDerivationsForBackfill: vi.fn(),
}));
vi.mock("@/server/human-quality/auto-promote", () => ({
  captureAndAutoPromote: vi.fn(),
}));

import { runCorpusBackfillBatch } from "@/server/human-quality/ingestion/backfill";
import { listEligibleDerivationsForBackfill } from "@/server/repositories/human-quality-ingestion";
import { captureAndAutoPromote } from "@/server/human-quality/auto-promote";

describe("runCorpusBackfillBatch", () => {
  it("processes eligible derivations idempotently", async () => {
    vi.mocked(listEligibleDerivationsForBackfill).mockResolvedValue([
      {
        workspaceId: "ws-1",
        derivationId: "d-1",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
    vi.mocked(captureAndAutoPromote).mockResolvedValue({
      candidate: { id: "c1" } as never,
      promoted: { created: true } as never,
    });

    const result = await runCorpusBackfillBatch({ batchSize: 500 });

    expect(result.processed).toBe(1);
    expect(result.created).toBe(1);
    expect(result.promoted).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.blocked).toBe(0);
    expect(captureAndAutoPromote).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      derivationId: "d-1",
    });
    expect(result.nextCursor).toEqual({
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "d-1",
    });
  });

  it("counts skipped when capture returns null", async () => {
    vi.mocked(listEligibleDerivationsForBackfill).mockResolvedValue([
      {
        workspaceId: "ws-1",
        derivationId: "d-1",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
    vi.mocked(captureAndAutoPromote).mockResolvedValue({
      candidate: null,
      promoted: null,
    });

    const result = await runCorpusBackfillBatch({ batchSize: 500 });

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    expect(result.promoted).toBe(0);
  });

  it("counts blocked when promote fails", async () => {
    vi.mocked(listEligibleDerivationsForBackfill).mockResolvedValue([
      {
        workspaceId: "ws-1",
        derivationId: "d-1",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
    vi.mocked(captureAndAutoPromote).mockResolvedValue({
      candidate: { id: "c1" } as never,
      promoted: null,
      promoteError: "missing_client_profile",
    });

    const result = await runCorpusBackfillBatch({ batchSize: 500 });

    expect(result.created).toBe(1);
    expect(result.blocked).toBe(1);
    expect(result.promoted).toBe(0);
  });
});
