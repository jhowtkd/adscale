import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/billing/paywall", () => ({
  spend: vi.fn(),
}));

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationById: vi.fn(),
  createPackageChildIfAbsent: vi.fn(),
  getActivePackageChildren: vi.fn(),
  updateDerivationStatus: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  updateCampaign: vi.fn(),
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: vi.fn() },
}));

vi.mock("@/server/memory/brand-memory-dispatch", () => ({
  recordBrandMemoryEvent: vi.fn(() => Promise.resolve()),
}));

import { spend } from "@/server/billing/paywall";
import {
  createPackageChildIfAbsent,
  getActivePackageChildren,
  getDerivationById,
} from "@/server/repositories/derivation";
import { inngest } from "@/server/jobs/client";
import { recordBrandMemoryEvent } from "@/server/memory/brand-memory-dispatch";
import { prepareDeliveryPackage } from "./prepare-delivery-package";

const mockSpend = vi.mocked(spend);
const mockGet = vi.mocked(getDerivationById);
const mockActive = vi.mocked(getActivePackageChildren);
const mockCreate = vi.mocked(createPackageChildIfAbsent);
const mockSend = vi.mocked(inngest.send);
const mockMemory = vi.mocked(recordBrandMemoryEvent);

const approved = {
  id: "src-1",
  status: "approved",
  outputKey: "out.png",
  campaignId: "c1",
  workspaceId: "ws-1",
  planId: null,
  format: "1:1",
  variantIndex: 0,
  ctaText: "Buy",
  generationMode: "art_variation",
  qualityScore: 80,
  qaStatus: null,
  qualityVerdict: "acceptable",
  hardFailures: [],
};

describe("prepareDeliveryPackage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(approved as never);
    mockActive.mockResolvedValue([]);
    mockSpend.mockResolvedValue({ ok: true, creditsSpent: 10 });
    mockCreate.mockImplementation(async (data) => ({
      child: { id: `child-${data.format}`, format: data.format },
      created: true as const,
    }));
    mockSend.mockResolvedValue({ ids: ["e"] } as never);
  });

  it("charges only for formats not already active and records memory", async () => {
    const result = await prepareDeliveryPackage({
      workspaceId: "ws-1",
      sourceDerivationId: "src-1",
      formats: ["1:1", "9:16", "4:5"],
      userId: "u1",
      locale: "pt-BR",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.readyFormats).toEqual(["1:1"]);
      expect(result.value.queued.map((q) => q.format).sort()).toEqual([
        "4:5",
        "9:16",
      ]);
    }
    expect(mockSpend).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delivery_package_child",
        amount: 10,
        idempotencyKey: "delivery-package:src-1:4:5,9:16",
      })
    );
    expect(mockMemory).toHaveBeenCalledWith(
      expect.objectContaining({ type: "delivery_prepared" })
    );
  });

  it("skips spend when all formats ready or active", async () => {
    const result = await prepareDeliveryPackage({
      workspaceId: "ws-1",
      sourceDerivationId: "src-1",
      formats: ["1:1"],
      userId: "u1",
    });
    expect(result.ok).toBe(true);
    expect(mockSpend).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects non-approved source", async () => {
    mockGet.mockResolvedValue({ ...approved, status: "completed" } as never);
    const result = await prepareDeliveryPackage({
      workspaceId: "ws-1",
      sourceDerivationId: "src-1",
      formats: ["9:16"],
      userId: "u1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("source_not_approved");
  });
});
