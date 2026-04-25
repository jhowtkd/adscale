import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: {
    send: vi.fn().mockResolvedValue(undefined),
  },
}));

import { db } from "@/server/db";
import { inngest } from "@/server/jobs/client";
import { createDerivation, updateDerivationStatus } from "@/server/repositories/derivation";

describe("derivation job flow", () => {
  const workspaceId = "ws-123";
  const campaignId = "camp-456";

  it("derivation creation emits Inngest event", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "deriv-1", status: "queued" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const derivation = await createDerivation({
      campaignId,
      workspaceId,
      status: "queued",
    });

    expect(derivation.status).toBe("queued");

    await inngest.send({
      name: "derivation.generate",
      data: {
        derivationId: derivation.id,
        campaignId,
        workspaceId,
      },
    });

    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "derivation.generate",
        data: expect.objectContaining({ derivationId: "deriv-1" }),
      })
    );
  });

  it("transitions status from queued to processing", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "deriv-1", status: "processing" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

    const updated = await updateDerivationStatus("deriv-1", workspaceId, "processing");

    expect(updated).toEqual({ id: "deriv-1", status: "processing" });
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "processing" })
    );
  });

  it("transitions status from processing to completed", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "deriv-1", status: "completed" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

    const updated = await updateDerivationStatus("deriv-1", workspaceId, "completed", "derivations/deriv-1/123.png");

    expect(updated).toEqual({ id: "deriv-1", status: "completed" });
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", outputKey: "derivations/deriv-1/123.png" })
    );
  });

  it("transitions status to failed", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "deriv-1", status: "failed" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

    const updated = await updateDerivationStatus("deriv-1", workspaceId, "failed");

    expect(updated).toEqual({ id: "deriv-1", status: "failed" });
  });
});
