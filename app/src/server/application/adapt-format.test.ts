import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/billing/paywall", () => ({
  spend: vi.fn(),
}));

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationById: vi.fn(),
  createDerivation: vi.fn(),
  deleteQueuedDerivation: vi.fn(),
  failQueuedDerivation: vi.fn(),
  getLatestFormatAdaptationChild: vi.fn(),
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

import { spend } from "@/server/billing/paywall";
import {
  createDerivation,
  getDerivationById,
} from "@/server/repositories/derivation";
import { inngest } from "@/server/jobs/client";
import { adaptFormat } from "./adapt-format";

const mockSpend = vi.mocked(spend);
const mockGet = vi.mocked(getDerivationById);
const mockCreate = vi.mocked(createDerivation);
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
      id: "c1-child",
      updatedAt: new Date("2026-07-26T12:00:00.000Z"),
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

  it("preserves the public credit-blocked spend at the application boundary", async () => {
    const blocked = {
      ok: false,
      status: 402,
      conversionPayload: { reason: "insufficient_credits" },
    } as const;
    mockSpend.mockResolvedValue(blocked as never);

    const result = await adaptFormat({
      workspaceId: "ws",
      sourceDerivationId: "s1",
      targetFormat: "9:16",
      userId: "u1",
      billingIdempotencyKey: "adapt:s1",
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "credit_blocked", spend: blocked },
    });
  });
});
