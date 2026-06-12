import { describe, expect, it } from "vitest";
import type { CreativePerformanceSnapshot } from "../../db/schema";
import { checkComparability } from "./comparability";

function minimalSnap(
  derivationId: string,
  platform = "meta"
): CreativePerformanceSnapshot {
  return {
    id: crypto.randomUUID(),
    workspaceId: "ws-1",
    clientProfileId: "cp-1",
    campaignId: "camp-1",
    derivationId,
    platform,
    placement: "feed",
    placementRaw: "feed",
    adAccountId: null,
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    sourceTimezone: "America/Sao_Paulo",
    currency: "BRL",
    impressions: "5000",
    clicks: "100",
    spend: "200",
    conversions: "10",
    conversionValue: "1000",
    sourceType: "manual",
    externalCampaignId: null,
    externalAdGroupId: null,
    externalAdId: null,
    sourceKey: `key-${derivationId}`,
    scopeKind: "total",
    scopeDimensions: null,
    sourceMetadata: null,
    createdByUserId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("checkComparability", () => {
  it("flags derivation from another campaign", () => {
    const exclusions = checkComparability({
      campaignId: "camp-1",
      campaignObjective: "sales",
      hypothesisPlatform: null,
      periodStart: null,
      periodEnd: null,
      variants: [
        { derivationId: "d1", campaignId: "camp-1" },
        { derivationId: "d2", campaignId: "camp-2" },
      ],
      snapshotsByDerivation: new Map([
        ["d1", [minimalSnap("d1")]],
        ["d2", [minimalSnap("d2")]],
      ]),
    });

    expect(exclusions.some((e) => e.code === "derivation_campaign_mismatch")).toBe(
      true
    );
  });
});
