import { describe, expect, it } from "vitest";
import type { CreativePerformanceSnapshot } from "../../db/schema";
import { normalizePlacement } from "../placement";
import { buildPerformanceSourceKey } from "../source-key";
import { previewFromCsvRows, previewFromManualRow } from "./preview";
import type { ColumnMapping, ParseOptions } from "./types";

const campaignId = "550e8400-e29b-41d4-a716-446655440000";
const derivationId = "550e8400-e29b-41d4-a716-446655440001";

const parseOptions: ParseOptions = {
  defaultCurrency: "BRL",
  locale: "pt-BR",
  decimalSeparator: ",",
  percentFormat: "fraction",
  sourceTimezone: "America/Sao_Paulo",
};

const mapping: ColumnMapping = {
  derivationId: "derivation_id",
  platform: "platform",
  placementRaw: "placement",
  startDate: "start_date",
  endDate: "end_date",
  impressions: "impressions",
  clicks: "clicks",
  spend: "spend",
  conversions: "conversions",
  conversionValue: "conversion_value",
  currency: "currency",
  adAccountId: "ad_account_id",
  externalCampaignId: "external_campaign_id",
  externalAdGroupId: "external_ad_group_id",
  externalAdId: "external_ad_id",
  sourceTimezone: "source_timezone",
};

const existingSnapshot = {
  id: "snapshot-1",
  workspaceId: "workspace-1",
  clientProfileId: "client-1",
  campaignId,
  derivationId,
  platform: "meta",
  placement: "feed",
  placementRaw: "Instagram Feed",
  adAccountId: null,
  startDate: "2026-06-01",
  endDate: "2026-06-07",
  sourceTimezone: "America/Sao_Paulo",
  currency: "BRL",
  impressions: "1000",
  clicks: "25",
  spend: "50.25",
  conversions: "2.5",
  conversionValue: "201",
  sourceType: "manual",
  externalCampaignId: null,
  externalAdGroupId: null,
  externalAdId: null,
  sourceKey: "existing-key",
  scopeKind: "total",
  scopeDimensions: null,
  sourceMetadata: null,
  createdByUserId: "user-1",
  createdAt: new Date("2026-06-12T00:00:00.000Z"),
  updatedAt: new Date("2026-06-12T00:00:00.000Z"),
} satisfies CreativePerformanceSnapshot;

describe("import preview", () => {
  it("classifies a valid CSV row as wouldCreate", () => {
    const headers = Object.values(mapping);
    const row = [
      derivationId,
      "meta",
      "Instagram Feed",
      "2026-06-01",
      "2026-06-07",
      "1000",
      "25",
      "50,25",
      "2,5",
      "201",
      "BRL",
    ];

    const result = previewFromCsvRows({
      campaignId,
      headers,
      rows: [row],
      columnMapping: mapping,
      parseOptions,
      derivationIds: new Set([derivationId]),
      existingSnapshots: [],
    });

    expect(result.summary.valid).toBe(1);
    expect(result.rows[0]?.classification).toBe("wouldCreate");
  });

  it("marks invalid derivation and locale values", () => {
    const headers = Object.values(mapping);
    const row = [
      "not-a-uuid",
      "meta",
      "Instagram Feed",
      "2026-06-01",
      "2026-06-07",
      "1000",
      "25",
      "50,25",
      "2,5",
      "201",
      "BRL",
    ];

    const result = previewFromCsvRows({
      campaignId,
      headers,
      rows: [row],
      columnMapping: mapping,
      parseOptions,
      derivationIds: new Set([derivationId]),
      existingSnapshots: [],
    });

    expect(result.summary.invalid).toBe(1);
    expect(result.rows[0]?.errors.length).toBeGreaterThan(0);
  });

  it("classifies identical existing snapshot as wouldIgnore", () => {
    const placement = normalizePlacement("meta", "Instagram Feed");
    const sourceKey = buildPerformanceSourceKey({
      derivationId,
      platform: "meta",
      placement: placement.placement,
      startDate: "2026-06-01",
      endDate: "2026-06-07",
      sourceType: "manual",
      scope: { kind: "total" },
    });

    const result = previewFromManualRow({
      campaignId,
      manual: {
        derivationId,
        platform: "meta",
        placementRaw: "Instagram Feed",
        startDate: "2026-06-01",
        endDate: "2026-06-07",
        impressions: "1000",
        clicks: "25",
        spend: "50,25",
        conversions: "2,5",
        conversionValue: "201",
        currency: "BRL",
      },
      parseOptions,
      derivationIds: new Set([derivationId]),
      existingSnapshots: [{ ...existingSnapshot, sourceKey }],
    });

    expect(result.rows[0]?.classification).toBe("wouldIgnore");
  });

  it("classifies changed metrics as wouldUpdate", () => {
    const placement = normalizePlacement("meta", "Instagram Feed");
    const sourceKey = buildPerformanceSourceKey({
      derivationId,
      platform: "meta",
      placement: placement.placement,
      startDate: "2026-06-01",
      endDate: "2026-06-07",
      sourceType: "manual",
      scope: { kind: "total" },
    });

    const result = previewFromManualRow({
      campaignId,
      manual: {
        derivationId,
        platform: "meta",
        placementRaw: "Instagram Feed",
        startDate: "2026-06-01",
        endDate: "2026-06-07",
        impressions: "1000",
        clicks: "30",
        spend: "50,25",
        conversions: "2,5",
        conversionValue: "201",
        currency: "BRL",
      },
      parseOptions,
      derivationIds: new Set([derivationId]),
      existingSnapshots: [{ ...existingSnapshot, sourceKey }],
    });

    expect(result.rows[0]?.classification).toBe("wouldUpdate");
  });
});
