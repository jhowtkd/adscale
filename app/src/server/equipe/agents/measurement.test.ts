// Mensuração: shadow-mode snapshot over stubbed served-ads rows.

import { describe, expect, it } from "vitest";
import { ServedAdsMeasurementReader } from "./measurement";

describe("ServedAdsMeasurementReader", () => {
  it("reads totals in shadow mode without writing anything", async () => {
    const seen: Array<{ workspaceId: string; brandId: string; windowDays: number }> = [];
    const reader = new ServedAdsMeasurementReader(async (workspaceId, brandId, windowDays) => {
      seen.push({ workspaceId, brandId, windowDays });
      return [
        {
          ad_account_id: "act-1",
          ad_id: "ad-1",
          creative_id: "creative-1",
          format: "image",
          impressions: 1000,
          clicks: 50,
          spend: "120.5",
          conversions: 4,
        },
        {
          ad_account_id: "act-1",
          ad_id: "ad-2",
          creative_id: "creative-2",
          format: "video",
          impressions: 2000,
          clicks: 30,
          spend: "80",
          conversions: 1,
        },
      ] as never;
    });
    const snapshot = await reader.read({ workspaceId: "w", brandId: "brand-1", windowDays: 7 });
    expect(seen).toEqual([{ workspaceId: "w", brandId: "brand-1", windowDays: 7 }]);
    expect(snapshot.mode).toBe("shadow");
    expect(snapshot.sources).toEqual(["served_ads"]);
    expect(snapshot.totals).toMatchObject({ impressions: 3000, clicks: 80, spend: 200.5, conversions: 5 });
    expect(snapshot.topAds[0]?.creativeId).toBe("creative-1");
    expect(snapshot.recommendations[0]).toMatch(/\[shadow\]/);
  });

  it("defaults to a 7-day window", async () => {
    const reader = new ServedAdsMeasurementReader(async () => []);
    const snapshot = await reader.read({ workspaceId: "w", brandId: "brand-1" });
    expect(snapshot.windowDays).toBe(7);
    expect(snapshot.totals.spend).toBe(0);
  });
});
