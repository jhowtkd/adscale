import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/billing/paywall", () => ({
  spend: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
  updateCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/asset", () => ({
  getAssetsByCampaign: vi.fn(),
  getAssetWithMetadata: vi.fn(),
}));

vi.mock("@/server/repositories/derivation", () => ({
  createDerivation: vi.fn(),
  updateDerivationStatus: vi.fn(),
  campaignHasActiveDerivations: vi.fn(),
  deleteQueuedDerivation: vi.fn(),
  failQueuedDerivation: vi.fn(),
  touchQueuedDerivation: vi.fn(),
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
import { refundCredits } from "@/server/billing/credits";
import { getCampaignById, updateCampaign } from "@/server/repositories/campaign";
import {
  getAssetWithMetadata,
  getAssetsByCampaign,
} from "@/server/repositories/asset";
import {
  campaignHasActiveDerivations,
  createDerivation,
  failQueuedDerivation,
} from "@/server/repositories/derivation";
import { inngest } from "@/server/jobs/client";
import {
  resolveRestylingBaseAsset,
  resolveRestylingStyleAsset,
  restyleCampaign,
} from "./restyle-campaign";

const mockSpend = vi.mocked(spend);
const mockRefund = vi.mocked(refundCredits);
const mockCampaign = vi.mocked(getCampaignById);
const mockAssets = vi.mocked(getAssetsByCampaign);
const mockAssetMeta = vi.mocked(getAssetWithMetadata);
const mockHasActive = vi.mocked(campaignHasActiveDerivations);
const mockCreate = vi.mocked(createDerivation);
const mockFail = vi.mocked(failQueuedDerivation);
const mockSend = vi.mocked(inngest.send);
const mockUpdate = vi.mocked(updateCampaign);

const base = {
  id: "base-1",
  role: "base",
  width: 1080,
  height: 1080,
};
const style = {
  id: "style-1",
  role: "style_reference",
  width: 1080,
  height: 1080,
};

describe("restyle asset resolution", () => {
  it("picks base then style_reference", () => {
    const assets = [base, style] as never[];
    expect(resolveRestylingBaseAsset(assets)?.id).toBe("base-1");
    expect(resolveRestylingStyleAsset(assets, undefined, "base-1")?.id).toBe(
      "style-1"
    );
  });
});

describe("restyleCampaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCampaign.mockResolvedValue({ id: "c1" } as never);
    mockAssets.mockResolvedValue([base, style] as never);
    mockHasActive.mockResolvedValue(false);
    mockSpend.mockResolvedValue({ ok: true, creditsSpent: 5 });
    mockCreate.mockResolvedValue({
      id: "d1",
      format: "1080x1080",
      status: "queued",
      updatedAt: new Date("2026-07-27T12:00:00.000Z"),
    } as never);
    mockSend.mockResolvedValue({ ids: ["e1"] } as never);
    mockUpdate.mockResolvedValue(undefined as never);
    mockFail.mockResolvedValue({ id: "d1", status: "failed" } as never);
    mockRefund.mockResolvedValue({ status: "refunded" } as never);
  });

  it("uses historical HTTP billing key when key omitted", async () => {
    const result = await restyleCampaign({
      workspaceId: "ws-1",
      campaignId: "c1",
      userId: "u1",
      billingAction: "image_derivation",
      billingAmount: 5,
    });
    expect(result.ok).toBe(true);
    expect(mockSpend).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "image_derivation",
        idempotencyKey: "restyling:c1:base-1",
      })
    );
  });

  it("resolves baseCreativeId via asset repository (Assistente path)", async () => {
    mockAssetMeta.mockResolvedValue({
      id: "base-1",
      campaignId: "c1",
    } as never);

    const result = await restyleCampaign({
      workspaceId: "ws-1",
      userId: "u1",
      baseCreativeId: "base-1",
      styleAssetId: "style-1",
      billingAction: "restyling",
      billingAmount: 5,
      billingIdempotencyKey: "assistant-action:a1:quick_restyle",
      assistantActionId: "a1",
    });

    expect(result.ok).toBe(true);
    expect(mockAssetMeta).toHaveBeenCalledWith("base-1", "ws-1");
    expect(mockSpend).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "restyling",
        idempotencyKey: "assistant-action:a1:quick_restyle",
      })
    );
  });

  it("rejects when baseCreativeId asset is missing", async () => {
    mockAssetMeta.mockResolvedValue(null);
    const result = await restyleCampaign({
      workspaceId: "ws-1",
      userId: "u1",
      baseCreativeId: "missing",
      billingAction: "restyling",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("base_creative_not_found");
  });

  it("rejects when required base does not match resolved base", async () => {
    mockAssetMeta.mockResolvedValue({
      id: "other-base",
      campaignId: "c1",
    } as never);
    const result = await restyleCampaign({
      workspaceId: "ws-1",
      userId: "u1",
      baseCreativeId: "other-base",
      billingAction: "restyling",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid_base_asset");
    expect(mockSpend).not.toHaveBeenCalled();
  });

  it("refunds exactly once when synchronous dispatch fails", async () => {
    mockSend.mockRejectedValue(new Error("inngest down"));

    const result = await restyleCampaign({
      workspaceId: "ws-1",
      campaignId: "c1",
      userId: "u1",
      billingAction: "image_derivation",
      billingAmount: 5,
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "dispatch_failed", derivationId: "d1" },
    });
    expect(mockFail).toHaveBeenCalledWith("d1", "ws-1");
    expect(mockRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        idempotencyKey: "restyling:c1:base-1:dispatch-refund",
        amount: 5,
      }),
    );
  });
});
