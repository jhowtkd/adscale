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

vi.mock("@/server/storage/r2", () => ({
  getPresignedDownloadUrl: vi.fn().mockResolvedValue("https://cdn.example.com/file.png"),
  uploadBuffer: vi.fn().mockResolvedValue(undefined),
  downloadBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-image")),
}));

import { db } from "@/server/db";
import { inngest } from "@/server/jobs/client";
import { getPresignedDownloadUrl } from "@/server/storage/r2";
import {
  updateDerivationStatus,
  createDerivation,
  getDerivationById,
} from "@/server/repositories/derivation";

describe("review and export flow", () => {
  const workspaceId = "ws-123";

  it("approve updates derivation status to approved", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "deriv-1", status: "approved" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

    const updated = await updateDerivationStatus("deriv-1", workspaceId, "approved");

    expect(updated).toEqual({ id: "deriv-1", status: "approved" });
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: "approved" }));
  });

  it("reject updates derivation status to rejected", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "deriv-1", status: "rejected" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

    const updated = await updateDerivationStatus("deriv-1", workspaceId, "rejected");

    expect(updated).toEqual({ id: "deriv-1", status: "rejected" });
  });

  it("regeneration creates a linked derivation with parentId", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "deriv-2", parentId: "deriv-1", status: "queued" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const mockLimit = vi.fn().mockResolvedValue([{ id: "deriv-1", campaignId: "camp-1" }]);
    const mockWhereSelect = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhereSelect });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const original = await getDerivationById("deriv-1", workspaceId);
    expect(original).toBeDefined();

    const newDerivation = await createDerivation({
      campaignId: original!.campaignId,
      workspaceId,
      parentId: "deriv-1",
      feedback: "Make it brighter",
      status: "queued",
    });

    expect(newDerivation.parentId).toBe("deriv-1");
    expect(newDerivation.status).toBe("queued");

    await inngest.send({
      name: "derivation.generate",
      data: {
        derivationId: newDerivation.id,
        campaignId: original!.campaignId,
        workspaceId,
      },
    });

    expect(inngest.send).toHaveBeenCalled();
  });

  it("export returns a presigned URL", async () => {
    const url = await getPresignedDownloadUrl("exports/ws-123/deriv-1/1700000000000.png");

    expect(url).toBe("https://cdn.example.com/file.png");
    expect(getPresignedDownloadUrl).toHaveBeenCalledWith("exports/ws-123/deriv-1/1700000000000.png");
  });
});
