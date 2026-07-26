import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/billing/paywall", () => ({
  spend: vi.fn(),
}));

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationById: vi.fn(),
  createPackageChildIfAbsent: vi.fn(),
  deleteQueuedDerivation: vi.fn(),
  updateDerivationStatus: vi.fn(),
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

import { spend } from "@/server/billing/paywall";
import {
  createPackageChildIfAbsent,
  getDerivationById,
} from "@/server/repositories/derivation";
import { inngest } from "@/server/jobs/client";
import { adaptFormat } from "./adapt-format";

const mockSpend = vi.mocked(spend);
const mockGet = vi.mocked(getDerivationById);
const mockCreate = vi.mocked(createPackageChildIfAbsent);
const mockSend = vi.mocked(inngest.send);

describe("adaptFormat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpend.mockResolvedValue({ ok: true, creditsSpent: 5 });
    mockGet.mockResolvedValue({
      id: "s1",
      outputKey: "out.png",
      campaignId: "c1",
      planId: null,
      variantIndex: 0,
      ctaText: "Buy",
    } as never);
    mockCreate.mockResolvedValue({
      child: { id: "c1-child" },
      created: true,
    } as never);
    mockSend.mockResolvedValue({ ids: ["e"] } as never);
  });

  it("charges and queues format_adaptation child", async () => {
    const result = await adaptFormat({
      workspaceId: "ws",
      sourceDerivationId: "s1",
      targetFormat: "9:16",
      userId: "u1",
      billingIdempotencyKey: "adapt:s1",
    });
    expect(result.ok).toBe(true);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        generationMode: "format_adaptation",
        format: "9:16",
        parentId: "s1",
      })
    );
  });
});
