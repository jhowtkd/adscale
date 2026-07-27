import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/billing/paywall", () => ({
  spend: vi.fn(),
}));

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationById: vi.fn(),
  createPackageChildIfAbsent: vi.fn(),
  getActivePackageChildren: vi.fn(),
  updateDerivationStatus: vi.fn(),
  deleteQueuedDerivation: vi.fn(),
  failQueuedDerivation: vi.fn(),
  touchQueuedDerivation: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  updateCampaign: vi.fn(),
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: vi.fn() },
}));

vi.mock("@/server/billing/credits", () => ({
  refundCredits: vi.fn(),
}));

vi.mock("@/server/repositories/usage", () => ({
  getUsageByIdempotencyKey: vi.fn(),
  trackUsage: vi.fn(),
}));

vi.mock("@/server/memory/brand-memory-dispatch", () => ({
  recordBrandMemoryEvent: vi.fn(() => Promise.resolve()),
}));

import { spend } from "@/server/billing/paywall";
import { refundCredits } from "@/server/billing/credits";
import {
  createPackageChildIfAbsent,
  failQueuedDerivation,
  getActivePackageChildren,
  getDerivationById,
} from "@/server/repositories/derivation";
import { inngest } from "@/server/jobs/client";
import { recordBrandMemoryEvent } from "@/server/memory/brand-memory-dispatch";
import { prepareDeliveryPackage } from "./prepare-delivery-package";

const mockSpend = vi.mocked(spend);
const mockRefund = vi.mocked(refundCredits);
const mockGet = vi.mocked(getDerivationById);
const mockActive = vi.mocked(getActivePackageChildren);
const mockCreate = vi.mocked(createPackageChildIfAbsent);
const mockFail = vi.mocked(failQueuedDerivation);
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
      child: {
        id: `child-${data.format}`,
        format: data.format,
        status: "queued",
        updatedAt: new Date("2026-07-27T12:00:00.000Z"),
      },
      created: true as const,
    }));
    mockSend.mockResolvedValue({ ids: ["e"] } as never);
    mockFail.mockImplementation(async (id) => ({ id, status: "failed" }) as never);
    mockRefund.mockResolvedValue({ status: "refunded" } as never);
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
        // Key binds claimed child ids so a later attempt cannot replay this settlement.
        idempotencyKey: expect.stringMatching(
          /^delivery-package:src-1:4:5,9:16:child-4:5,child-9:16$/,
        ),
      }),
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

  it("refunds the batch charge when synchronous dispatch fails", async () => {
    mockSend.mockRejectedValue(new Error("inngest down"));

    const result = await prepareDeliveryPackage({
      workspaceId: "ws-1",
      sourceDerivationId: "src-1",
      formats: ["9:16", "4:5"],
      userId: "u1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.failed.map((item) => item.format).sort()).toEqual([
        "4:5",
        "9:16",
      ]);
      expect(result.value.queued).toEqual([]);
    }
    expect(mockRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        action: "delivery_package_child",
        amount: 10,
        idempotencyKey: expect.stringMatching(
          /^delivery-package:src-1:4:5,9:16:child-4:5,child-9:16:dispatch-refund$/,
        ),
      }),
    );
  });

  it("charges only formats actually claimed when a create race drops one", async () => {
    mockCreate.mockImplementation(async (data) => {
      if (data.format === "9:16") {
        return {
          child: {
            id: "existing-9:16",
            format: "9:16",
            status: "queued",
            updatedAt: new Date("2026-07-27T12:00:00.000Z"),
          },
          created: false as const,
        };
      }
      return {
        child: {
          id: `child-${data.format}`,
          format: data.format,
          status: "queued",
          updatedAt: new Date("2026-07-27T12:00:00.000Z"),
        },
        created: true as const,
      };
    });

    const result = await prepareDeliveryPackage({
      workspaceId: "ws-1",
      sourceDerivationId: "src-1",
      formats: ["4:5", "9:16"],
      userId: "u1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.queued.map((q) => q.format)).toEqual(["4:5"]);
      expect(result.value.skipped).toContain("9:16");
    }
    expect(mockSpend).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delivery_package_child",
        amount: 5,
        idempotencyKey: expect.stringMatching(
          /^delivery-package:src-1:4:5:child-4:5$/,
        ),
      }),
    );
  });
});
