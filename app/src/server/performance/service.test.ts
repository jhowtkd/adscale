import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../repositories/campaign", () => ({ getCampaignById: vi.fn() }));
vi.mock("../repositories/client-reference", () => ({ getClientProfile: vi.fn() }));
vi.mock("../repositories/derivation", () => ({ getDerivationById: vi.fn() }));
vi.mock("../repositories/performance", () => ({
  listPerformanceSnapshotsByCampaign: vi.fn(),
  upsertPerformanceSnapshot: vi.fn(),
}));

import { getCampaignById } from "../repositories/campaign";
import { getClientProfile } from "../repositories/client-reference";
import { getDerivationById } from "../repositories/derivation";
import {
  listPerformanceSnapshotsByCampaign,
  upsertPerformanceSnapshot,
} from "../repositories/performance";
import {
  getCampaignPerformanceSnapshots,
  PerformanceDomainError,
  recordPerformanceSnapshot,
} from "./service";

const input = {
  campaignId: "550e8400-e29b-41d4-a716-446655440000",
  derivationId: "550e8400-e29b-41d4-a716-446655440001",
  platform: "meta" as const,
  placementRaw: "Instagram Feed",
  startDate: "2026-06-01",
  endDate: "2026-06-07",
  sourceTimezone: "America/Sao_Paulo",
  currency: "BRL",
  sourceType: "manual" as const,
  scope: { kind: "total" as const },
  metrics: {
    impressions: "1000",
    clicks: "25",
    spend: "50.25",
    conversions: "2.5",
    conversionValue: "201",
  },
};

const saved = {
  id: "snapshot-1",
  workspaceId: "workspace-1",
  clientProfileId: "client-1",
  ...input,
  placement: "feed",
  placementRaw: "Instagram Feed",
  adAccountId: null,
  impressions: input.metrics.impressions,
  clicks: input.metrics.clicks,
  spend: input.metrics.spend,
  conversions: input.metrics.conversions,
  conversionValue: input.metrics.conversionValue,
  externalCampaignId: null,
  externalAdGroupId: null,
  externalAdId: null,
  sourceKey: "a".repeat(64),
  scopeKind: "total",
  scopeDimensions: null,
  sourceMetadata: null,
  createdByUserId: "user-1",
  createdAt: new Date("2026-06-12T00:00:00.000Z"),
  updatedAt: new Date("2026-06-12T00:00:00.000Z"),
};

describe("performance service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCampaignById).mockResolvedValue({
      id: input.campaignId,
      clientProfileId: "client-1",
    } as never);
    vi.mocked(getDerivationById).mockResolvedValue({
      id: input.derivationId,
      campaignId: input.campaignId,
    } as never);
    vi.mocked(getClientProfile).mockResolvedValue({ id: "client-1" } as never);
    vi.mocked(upsertPerformanceSnapshot).mockResolvedValue(saved as never);
  });

  it("normalizes, keys, persists, and derives exact metrics", async () => {
    const result = await recordPerformanceSnapshot({
      workspaceId: "workspace-1",
      userId: "user-1",
      snapshot: input,
    });

    expect(upsertPerformanceSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        clientProfileId: "client-1",
        placement: "feed",
        sourceKey: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
    );
    expect(result.derivedMetrics).toEqual({
      ctr: "0.025",
      cpc: "2.01",
      cpa: "20.1",
      roas: "4",
    });
  });

  it("rejects a derivation from another campaign", async () => {
    vi.mocked(getDerivationById).mockResolvedValue({
      id: input.derivationId,
      campaignId: "other-campaign",
    } as never);

    await expect(
      recordPerformanceSnapshot({
        workspaceId: "workspace-1",
        userId: "user-1",
        snapshot: input,
      })
    ).rejects.toMatchObject<Partial<PerformanceDomainError>>({
      code: "performanceDerivationCampaignMismatch",
      status: 409,
    });
  });

  it("requires a campaign client profile", async () => {
    vi.mocked(getCampaignById).mockResolvedValue({
      id: input.campaignId,
      clientProfileId: null,
    } as never);

    await expect(
      recordPerformanceSnapshot({
        workspaceId: "workspace-1",
        userId: "user-1",
        snapshot: input,
      })
    ).rejects.toMatchObject({ code: "performanceClientProfileRequired" });
  });

  it("lists campaign snapshots with derived metrics", async () => {
    vi.mocked(listPerformanceSnapshotsByCampaign).mockResolvedValue([
      saved as never,
    ]);

    const result = await getCampaignPerformanceSnapshots({
      campaignId: input.campaignId,
      workspaceId: "workspace-1",
    });

    expect(result[0].derivedMetrics.roas).toBe("4");
  });
});
