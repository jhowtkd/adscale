import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  db: {
    transaction: vi.fn(),
  },
}));
vi.mock("../../repositories/campaign", () => ({ getCampaignById: vi.fn() }));
vi.mock("../../repositories/derivation", () => ({
  getDerivationsByCampaign: vi.fn(),
}));
vi.mock("../../repositories/performance", () => ({
  listPerformanceSnapshotsByCampaign: vi.fn(),
  getPerformanceSnapshotsBySourceKeys: vi.fn(),
  bulkUpsertPerformanceSnapshots: vi.fn(),
}));
vi.mock("../../repositories/performance-import", () => ({
  createPerformanceImportBatch: vi.fn(),
  createPerformanceImportRows: vi.fn(),
  updatePerformanceImportBatchCounts: vi.fn(),
  listPerformanceImportBatchesByCampaign: vi.fn(),
  getPerformanceImportBatchById: vi.fn(),
  listPerformanceImportRowsByBatch: vi.fn(),
}));
vi.mock("../service", () => ({
  PerformanceDomainError: class PerformanceDomainError extends Error {
    constructor(
      public readonly code: string,
      public readonly status: number
    ) {
      super(code);
    }
  },
}));

import { db } from "../../db";
import { getCampaignById } from "../../repositories/campaign";
import { getDerivationsByCampaign } from "../../repositories/derivation";
import {
  createPerformanceImportBatch,
  createPerformanceImportRows,
  getPerformanceImportBatchById,
  listPerformanceImportBatchesByCampaign,
  listPerformanceImportRowsByBatch,
  updatePerformanceImportBatchCounts,
} from "../../repositories/performance-import";
import {
  bulkUpsertPerformanceSnapshots,
  getPerformanceSnapshotsBySourceKeys,
  listPerformanceSnapshotsByCampaign,
} from "../../repositories/performance";
import { normalizePlacement } from "../placement";
import { buildPerformanceSourceKey } from "../source-key";
import {
  confirmImport,
  getBatchDetail,
  hashCsvContent,
  listBatches,
  previewCsvImport,
  previewManualImport,
} from "./service";

const campaignId = "550e8400-e29b-41d4-a716-446655440000";
const derivationId = "550e8400-e29b-41d4-a716-446655440001";

const parseOptions = {
  defaultCurrency: "BRL",
  locale: "pt-BR" as const,
  decimalSeparator: "," as const,
  percentFormat: "fraction" as const,
  sourceTimezone: "America/Sao_Paulo",
};

const mapping = {
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

describe("import service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCampaignById).mockResolvedValue({
      id: campaignId,
      clientProfileId: "client-1",
    } as never);
    vi.mocked(getDerivationsByCampaign).mockResolvedValue([
      { id: derivationId },
    ] as never);
    vi.mocked(listPerformanceSnapshotsByCampaign).mockResolvedValue([]);
  });

  it("hashes csv content deterministically", () => {
    expect(hashCsvContent("a,b\n1,2")).toHaveLength(64);
    expect(hashCsvContent("a,b\n1,2")).toBe(hashCsvContent("a,b\n1,2"));
  });

  it("previews csv imports", async () => {
    const csv = [
      "derivation_id,platform,placement,start_date,end_date,impressions,clicks,spend,conversions,conversion_value,currency",
      `${derivationId},meta,Instagram Feed,2026-06-01,2026-06-07,1000,25,50.25,2.5,201,BRL`,
    ].join("\n");

    const result = await previewCsvImport({
      campaignId,
      workspaceId: "workspace-1",
      content: csv,
      fileName: "results.csv",
      columnMapping: mapping,
      parseOptions,
    });

    expect(result.summary.valid).toBe(1);
    expect(result.fileHash).toBeDefined();
  });

  it("previews manual imports", async () => {
    const result = await previewManualImport({
      campaignId,
      workspaceId: "workspace-1",
      parseOptions,
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
      },
    });

    expect(result.summary.total).toBe(1);
  });

  it("confirms import and records lineage", async () => {
    const preview = await previewManualImport({
      campaignId,
      workspaceId: "workspace-1",
      parseOptions,
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
      },
    });

    vi.mocked(db.transaction).mockImplementation(async (callback) =>
      callback({} as never)
    );
    vi.mocked(createPerformanceImportBatch).mockResolvedValue({
      id: "batch-1",
    } as never);
    vi.mocked(getPerformanceSnapshotsBySourceKeys).mockResolvedValue(new Map());
    vi.mocked(bulkUpsertPerformanceSnapshots).mockResolvedValue(
      new Map([
        [
          preview.rows[0]?.sourceKey ?? "missing",
          { id: "snapshot-1", sourceKey: preview.rows[0]?.sourceKey ?? "missing" },
        ],
      ] as never)
    );

    const result = await confirmImport({
      campaignId,
      workspaceId: "workspace-1",
      userId: "user-1",
      sourceType: "manual",
      preview,
      parseOptions,
    });

    expect(result.batchId).toBe("batch-1");
    expect(result.createdCount).toBe(1);
    expect(createPerformanceImportRows).toHaveBeenCalled();
    expect(bulkUpsertPerformanceSnapshots).toHaveBeenCalled();
    expect(updatePerformanceImportBatchCounts).toHaveBeenCalled();
  });

  it("rejects preview when campaign is outside workspace", async () => {
    vi.mocked(getCampaignById).mockResolvedValue(null);

    await expect(
      previewManualImport({
        campaignId,
        workspaceId: "workspace-other",
        parseOptions,
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
        },
      })
    ).rejects.toMatchObject({ code: "performanceCampaignNotFound", status: 404 });
  });

  it("confirms attribution update for existing snapshot", async () => {
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

    vi.mocked(listPerformanceSnapshotsByCampaign).mockResolvedValue([
      {
        id: "snapshot-existing",
        workspaceId: "workspace-1",
        clientProfileId: "client-1",
        campaignId,
        derivationId,
        platform: "meta",
        placement: placement.placement,
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
        sourceKey,
        scopeKind: "total",
        scopeDimensions: null,
        sourceMetadata: null,
        createdByUserId: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never);

    const preview = await previewManualImport({
      campaignId,
      workspaceId: "workspace-1",
      parseOptions,
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
      },
    });

    expect(preview.rows[0]?.classification).toBe("wouldUpdate");

    vi.mocked(db.transaction).mockImplementation(async (callback) =>
      callback({} as never)
    );
    vi.mocked(createPerformanceImportBatch).mockResolvedValue({
      id: "batch-2",
    } as never);
    vi.mocked(getPerformanceSnapshotsBySourceKeys).mockResolvedValue(
      new Map([
        [
          sourceKey,
          {
            id: "snapshot-existing",
            sourceKey,
          },
        ],
      ] as never)
    );
    vi.mocked(bulkUpsertPerformanceSnapshots).mockResolvedValue(
      new Map([
        [
          sourceKey,
          { id: "snapshot-updated", sourceKey },
        ],
      ] as never)
    );

    const result = await confirmImport({
      campaignId,
      workspaceId: "workspace-1",
      userId: "user-1",
      sourceType: "manual",
      preview,
      parseOptions,
    });

    expect(result.updatedCount).toBe(1);
    expect(createPerformanceImportRows).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          status: "updated",
          snapshotId: "snapshot-updated",
        }),
      ]),
      expect.anything()
    );
  });

  it("rejects batch detail from another workspace", async () => {
    vi.mocked(getPerformanceImportBatchById).mockResolvedValue(null);

    await expect(
      getBatchDetail({
        campaignId,
        workspaceId: "workspace-other",
        batchId: "batch-1",
      })
    ).rejects.toMatchObject({ code: "importBatchNotFound", status: 404 });
  });

  it("lists batches and batch detail", async () => {
    vi.mocked(listPerformanceImportBatchesByCampaign).mockResolvedValue([
      { id: "batch-1", campaignId },
    ] as never);
    vi.mocked(getPerformanceImportBatchById).mockResolvedValue({
      id: "batch-1",
      campaignId,
    } as never);
    vi.mocked(listPerformanceImportRowsByBatch).mockResolvedValue([
      { id: "row-1" },
    ] as never);

    const batches = await listBatches({
      campaignId,
      workspaceId: "workspace-1",
    });
    const detail = await getBatchDetail({
      campaignId,
      workspaceId: "workspace-1",
      batchId: "batch-1",
    });

    expect(batches).toHaveLength(1);
    expect(detail.rows).toHaveLength(1);
  });
});
