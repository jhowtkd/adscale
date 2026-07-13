import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    })),
  },
}));

vi.mock("@/server/billing/paywall", () => ({
  spend: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
  updateCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/asset", () => ({
  getAssetsByCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/derivation", () => ({
  createDerivation: vi.fn(),
  updateDerivationStatus: vi.fn(),
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: vi.fn() },
}));

import { spend } from "@/server/billing/paywall";
import { getCampaignById, updateCampaign } from "@/server/repositories/campaign";
import { getAssetsByCampaign } from "@/server/repositories/asset";
import { createDerivation } from "@/server/repositories/derivation";
import { inngest } from "@/server/jobs/client";
import {
  resolveRestylingBaseAsset,
  resolveRestylingStyleAsset,
  restyleCampaign,
} from "./restyle-campaign";

const mockSpend = vi.mocked(spend);
const mockCampaign = vi.mocked(getCampaignById);
const mockAssets = vi.mocked(getAssetsByCampaign);
const mockCreate = vi.mocked(createDerivation);
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
    mockSpend.mockResolvedValue({ ok: true, creditsSpent: 5 });
    mockCreate.mockResolvedValue({
      id: "d1",
      format: "1080x1080",
      status: "queued",
    } as never);
    mockSend.mockResolvedValue({ ids: ["e1"] } as never);
    mockUpdate.mockResolvedValue(undefined as never);
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
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "derivation.generate",
        data: expect.objectContaining({
          generationMode: "restyling",
          styleAssetId: "style-1",
        }),
      })
    );
  });

  it("honors assistant billing key and requireBaseAssetId", async () => {
    const result = await restyleCampaign({
      workspaceId: "ws-1",
      campaignId: "c1",
      userId: "u1",
      requireBaseAssetId: "base-1",
      styleAssetId: "style-1",
      billingAction: "restyling",
      billingAmount: 5,
      billingIdempotencyKey: "assistant-action:a1:quick_restyle",
      assistantActionId: "a1",
    });
    expect(result.ok).toBe(true);
    expect(mockSpend).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "restyling",
        idempotencyKey: "assistant-action:a1:quick_restyle",
      })
    );
  });

  it("rejects when required base does not match resolved base", async () => {
    const result = await restyleCampaign({
      workspaceId: "ws-1",
      campaignId: "c1",
      userId: "u1",
      requireBaseAssetId: "other-base",
      billingAction: "restyling",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid_base_asset");
    expect(mockSpend).not.toHaveBeenCalled();
  });
});
