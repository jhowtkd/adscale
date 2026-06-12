import { describe, expect, it } from "vitest";
import { isColumnMappingComplete, mapCsvRow } from "./map-row";
import type { ColumnMapping } from "./types";

const mapping: ColumnMapping = {
  derivationId: "Derivation ID",
  platform: "Platform",
  placementRaw: "Placement",
  startDate: "Start",
  endDate: "End",
  impressions: "Impressions",
  clicks: "Clicks",
  spend: "Spend",
  conversions: "Conversions",
  conversionValue: "Value",
  currency: "Currency",
  adAccountId: "Account",
  externalCampaignId: "Campaign",
  externalAdGroupId: "Ad Group",
  externalAdId: "Ad",
  sourceTimezone: "Timezone",
};

describe("mapCsvRow", () => {
  it("maps headers case-insensitively", () => {
    const headers = [
      "derivation id",
      "platform",
      "placement",
      "start",
      "end",
      "impressions",
      "clicks",
      "spend",
      "conversions",
      "value",
      "currency",
    ];
    const row = [
      "uuid-1",
      "meta",
      "Feed",
      "2026-06-01",
      "2026-06-07",
      "1000",
      "25",
      "50.25",
      "2",
      "200",
      "BRL",
    ];

    expect(mapCsvRow(headers, row, mapping)).toEqual({
      derivationId: "uuid-1",
      platform: "meta",
      placementRaw: "Feed",
      startDate: "2026-06-01",
      endDate: "2026-06-07",
      impressions: "1000",
      clicks: "25",
      spend: "50.25",
      conversions: "2",
      conversionValue: "200",
      currency: "BRL",
    });
  });
});

describe("isColumnMappingComplete", () => {
  it("flags missing headers", () => {
    const result = isColumnMappingComplete(["Platform"], mapping);
    expect(result.complete).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });
});
