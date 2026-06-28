import { createHash } from "node:crypto";
import { z } from "zod";
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
  type DbOrTx,
} from "../../repositories/performance-import";
import {
  bulkUpsertPerformanceSnapshots,
  getPerformanceSnapshotsBySourceKeys,
  listPerformanceSnapshotsByCampaign,
  type UpsertPerformanceSnapshotInput,
} from "../../repositories/performance";
import { dispatchLearningRecomputeForCampaign } from "../learning/dispatch";
import { PerformanceDomainError } from "../service";
import { normalizePlacement } from "../placement";
import { isColumnMappingComplete } from "./map-row";
import { parseCsv } from "./csv-parse";
import {
  previewFromCsvRows,
  previewFromManualRow,
  snapshotMatchesInput,
} from "./preview";
import type {
  ColumnMapping,
  ImportPreviewResult,
  ImportRowStatus,
  ImportSourceType,
  ManualImportInput,
  MappableCsvColumn,
  ParseOptions,
  PreviewRow,
} from "./types";
import type { CanonicalPerformanceSnapshotInput } from "../validation";
import { CSV_MAX_BYTES, CSV_MAX_ROWS, OPTIONAL_CSV_COLUMNS, REQUIRED_CSV_COLUMNS } from "./types";

export const parseOptionsSchema = z
  .object({
    defaultCurrency: z.string().trim().regex(/^[A-Za-z]{3}$/),
    locale: z.enum(["pt-BR", "en-US"]),
    decimalSeparator: z.enum([".", ","]),
    percentFormat: z.enum(["fraction", "percent"]),
    sourceTimezone: z.string().trim().min(1).max(100),
  })
  .strict();

const mappableColumnSchema = z.enum([
  ...REQUIRED_CSV_COLUMNS,
  ...OPTIONAL_CSV_COLUMNS,
] as [MappableCsvColumn, ...MappableCsvColumn[]]);

export const columnMappingSchema = z
  .object(
    Object.fromEntries(
      [...REQUIRED_CSV_COLUMNS, ...OPTIONAL_CSV_COLUMNS].map((field) => [
        field,
        z.string().trim().min(1).optional(),
      ])
    ) as Record<MappableCsvColumn, z.ZodOptional<z.ZodString>>
  )
  .superRefine((value, context) => {
    for (const field of REQUIRED_CSV_COLUMNS) {
      if (!value[field]?.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: "Required column mapping is missing",
        });
      }
    }
  })
  .transform((value) => value as ColumnMapping);

export const manualImportInputSchema = z
  .object({
    derivationId: z.string().uuid(),
    platform: z.string().trim().min(1),
    placementRaw: z.string().trim().min(1),
    startDate: z.string().trim().min(1),
    endDate: z.string().trim().min(1),
    impressions: z.string().trim().min(1),
    clicks: z.string().trim().min(1),
    spend: z.string().trim().min(1),
    conversions: z.string().trim().min(1),
    conversionValue: z.string().trim().min(1),
    currency: z.string().trim().optional(),
    adAccountId: z.string().trim().optional().nullable(),
    externalCampaignId: z.string().trim().optional().nullable(),
    externalAdGroupId: z.string().trim().optional().nullable(),
    externalAdId: z.string().trim().optional().nullable(),
    sourceTimezone: z.string().trim().optional(),
  })
  .strict();

async function assertCampaignAccess(campaignId: string, workspaceId: string) {
  const campaign = await getCampaignById(campaignId, workspaceId);
  if (!campaign) {
    throw new PerformanceDomainError("performanceCampaignNotFound", 404);
  }
  return campaign;
}

async function loadImportContext(campaignId: string, workspaceId: string) {
  const [derivations, existingSnapshots] = await Promise.all([
    getDerivationsByCampaign(campaignId, workspaceId),
    listPerformanceSnapshotsByCampaign(campaignId, workspaceId),
  ]);

  return {
    derivationIds: new Set(derivations.map((derivation) => derivation.id)),
    existingSnapshots,
  };
}

export function hashCsvContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function previewCsvImport(input: {
  campaignId: string;
  workspaceId: string;
  content: string;
  fileName?: string;
  columnMapping: ColumnMapping;
  parseOptions: ParseOptions;
}): Promise<ImportPreviewResult> {
  if (Buffer.byteLength(input.content, "utf8") > CSV_MAX_BYTES) {
    throw new PerformanceDomainError("importFileTooLarge", 400);
  }

  await assertCampaignAccess(input.campaignId, input.workspaceId);
  const { derivationIds, existingSnapshots } = await loadImportContext(
    input.campaignId,
    input.workspaceId
  );

  const parsed = parseCsv(input.content, { maxRows: CSV_MAX_ROWS });
  const mappingCheck = isColumnMappingComplete(parsed.headers, input.columnMapping);
  if (!mappingCheck.complete) {
    throw new PerformanceDomainError("importColumnMappingIncomplete", 400);
  }

  return previewFromCsvRows({
    campaignId: input.campaignId,
    headers: parsed.headers,
    rows: parsed.rows,
    columnMapping: input.columnMapping,
    parseOptions: input.parseOptions,
    derivationIds,
    existingSnapshots,
    detectedDelimiter: parsed.detectedDelimiter,
    fileHash: hashCsvContent(input.content),
    fileName: input.fileName,
  });
}

export async function previewManualImport(input: {
  campaignId: string;
  workspaceId: string;
  manual: ManualImportInput;
  parseOptions: ParseOptions;
}): Promise<ImportPreviewResult> {
  await assertCampaignAccess(input.campaignId, input.workspaceId);
  const { derivationIds, existingSnapshots } = await loadImportContext(
    input.campaignId,
    input.workspaceId
  );

  return previewFromManualRow({
    campaignId: input.campaignId,
    manual: input.manual,
    parseOptions: input.parseOptions,
    derivationIds,
    existingSnapshots,
  });
}

export interface ConfirmImportResult {
  batchId: string;
  createdCount: number;
  updatedCount: number;
  ignoredCount: number;
  invalidCount: number;
}

function buildSnapshotUpsertInput(input: {
  workspaceId: string;
  userId: string;
  clientProfileId: string;
  campaignId: string;
  batchId: string;
  rowIndex: number;
  canonical: CanonicalPerformanceSnapshotInput;
  sourceKey: string;
}): UpsertPerformanceSnapshotInput {
  const normalizedPlacement = normalizePlacement(
    input.canonical.platform,
    input.canonical.placementRaw
  );

  return {
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    campaignId: input.campaignId,
    derivationId: input.canonical.derivationId,
    platform: input.canonical.platform,
    placement: normalizedPlacement.placement,
    placementRaw: normalizedPlacement.placementRaw,
    adAccountId: input.canonical.adAccountId ?? null,
    startDate: input.canonical.startDate,
    endDate: input.canonical.endDate,
    sourceTimezone: input.canonical.sourceTimezone,
    currency: input.canonical.currency,
    impressions: input.canonical.metrics.impressions,
    clicks: input.canonical.metrics.clicks,
    spend: input.canonical.metrics.spend,
    conversions: input.canonical.metrics.conversions,
    conversionValue: input.canonical.metrics.conversionValue,
    sourceType: input.canonical.sourceType,
    externalCampaignId: input.canonical.externalCampaignId ?? null,
    externalAdGroupId: input.canonical.externalAdGroupId ?? null,
    externalAdId: input.canonical.externalAdId ?? null,
    sourceKey: input.sourceKey,
    scopeKind: input.canonical.scope.kind,
    scopeDimensions:
      input.canonical.scope.kind === "segment"
        ? input.canonical.scope.dimensions
        : null,
    sourceMetadata: {
      importBatchId: input.batchId,
      importRowIndex: input.rowIndex,
      ...(input.canonical.sourceMetadata ?? {}),
    },
    createdByUserId: input.userId,
  };
}

async function persistImportRows(input: {
  batchId: string;
  previewRows: PreviewRow[];
  workspaceId: string;
  userId: string;
  clientProfileId: string;
  campaignId: string;
  tx: DbOrTx;
}): Promise<{
  createdCount: number;
  updatedCount: number;
  ignoredCount: number;
}> {
  const counts = {
    createdCount: 0,
    updatedCount: 0,
    ignoredCount: 0,
  };

  const validRows = input.previewRows.filter((row) => row.status !== "invalid");
  const sourceKeys = validRows
    .map((row) => row.sourceKey)
    .filter((sourceKey): sourceKey is string => Boolean(sourceKey));

  const existingBySourceKey = await getPerformanceSnapshotsBySourceKeys(
    sourceKeys,
    input.workspaceId,
    input.tx
  );

  const rowsToUpsert: Array<{
    row: PreviewRow;
    upsertInput: UpsertPerformanceSnapshotInput;
  }> = [];
  const importRows: Array<{
    batchId: string;
    rowIndex: number;
    status: ImportRowStatus;
    errors: PreviewRow["errors"] | null;
    snapshotId: string | null;
    sourceKey: string | null;
  }> = [];

  for (const row of input.previewRows) {
    if (row.status === "invalid") {
      importRows.push({
        batchId: input.batchId,
        rowIndex: row.rowIndex,
        status: "invalid",
        errors: row.errors,
        snapshotId: null,
        sourceKey: null,
      });
      continue;
    }

    const canonical = row.canonical!;
    const sourceKey = row.sourceKey!;
    const existing = existingBySourceKey.get(sourceKey);

    if (existing && snapshotMatchesInput(existing, canonical)) {
      counts.ignoredCount += 1;
      importRows.push({
        batchId: input.batchId,
        rowIndex: row.rowIndex,
        status: "ignored",
        errors: null,
        snapshotId: existing.id,
        sourceKey,
      });
      continue;
    }

    rowsToUpsert.push({
      row,
      upsertInput: buildSnapshotUpsertInput({
        workspaceId: input.workspaceId,
        userId: input.userId,
        clientProfileId: input.clientProfileId,
        campaignId: input.campaignId,
        batchId: input.batchId,
        rowIndex: row.rowIndex,
        canonical,
        sourceKey,
      }),
    });
  }

  const upsertedBySourceKey = await bulkUpsertPerformanceSnapshots(
    rowsToUpsert.map((entry) => entry.upsertInput),
    input.tx
  );

  for (const { row, upsertInput } of rowsToUpsert) {
    const saved = upsertedBySourceKey.get(upsertInput.sourceKey);
    if (!saved) {
      throw new PerformanceDomainError("performanceSnapshotUpsertFailed", 500);
    }

    const existing = existingBySourceKey.get(upsertInput.sourceKey);
    const status: ImportRowStatus = existing ? "updated" : "created";
    if (existing) {
      counts.updatedCount += 1;
    } else {
      counts.createdCount += 1;
    }

    importRows.push({
      batchId: input.batchId,
      rowIndex: row.rowIndex,
      status,
      errors: null,
      snapshotId: saved.id,
      sourceKey: upsertInput.sourceKey,
    });
  }

  importRows.sort((left, right) => left.rowIndex - right.rowIndex);
  await createPerformanceImportRows(importRows, input.tx);

  return counts;
}

export async function confirmImport(input: {
  campaignId: string;
  workspaceId: string;
  userId: string;
  sourceType: ImportSourceType;
  preview: ImportPreviewResult;
  fileName?: string | null;
  fileHash?: string | null;
  columnMapping?: ColumnMapping | null;
  parseOptions: ParseOptions;
}): Promise<ConfirmImportResult> {
  const campaign = await assertCampaignAccess(input.campaignId, input.workspaceId);
  const clientProfileId = campaign.clientProfileId;
  if (!clientProfileId) {
    throw new PerformanceDomainError("performanceClientProfileRequired", 409);
  }

  const counts = {
    createdCount: 0,
    updatedCount: 0,
    ignoredCount: 0,
    invalidCount: input.preview.summary.invalid,
  };

  return db.transaction(async (tx) => {
    const batch = await createPerformanceImportBatch(
      {
        workspaceId: input.workspaceId,
        campaignId: input.campaignId,
        sourceType: input.sourceType,
        fileName: input.fileName ?? null,
        fileHash: input.fileHash ?? null,
        columnMapping: input.columnMapping ?? null,
        parseOptions: input.parseOptions,
        createdCount: 0,
        updatedCount: 0,
        ignoredCount: 0,
        invalidCount: counts.invalidCount,
        createdByUserId: input.userId,
      },
      tx
    );

    const persistedCounts = await persistImportRows({
      batchId: batch.id,
      previewRows: input.preview.rows,
      workspaceId: input.workspaceId,
      userId: input.userId,
      clientProfileId,
      campaignId: input.campaignId,
      tx,
    });

    counts.createdCount = persistedCounts.createdCount;
    counts.updatedCount = persistedCounts.updatedCount;
    counts.ignoredCount = persistedCounts.ignoredCount;

    await updatePerformanceImportBatchCounts(batch.id, counts, tx);

    return {
      batchId: batch.id,
      ...counts,
    };
  }).then((result) => {
    void dispatchLearningRecomputeForCampaign({
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
    });
    return result;
  });
}

export async function listBatches(input: {
  campaignId: string;
  workspaceId: string;
}) {
  await assertCampaignAccess(input.campaignId, input.workspaceId);
  return listPerformanceImportBatchesByCampaign(
    input.campaignId,
    input.workspaceId
  );
}

export async function getBatchDetail(input: {
  campaignId: string;
  workspaceId: string;
  batchId: string;
}) {
  await assertCampaignAccess(input.campaignId, input.workspaceId);
  const batch = await getPerformanceImportBatchById(
    input.batchId,
    input.workspaceId
  );
  if (!batch || batch.campaignId !== input.campaignId) {
    throw new PerformanceDomainError("importBatchNotFound", 404);
  }

  const rows = await listPerformanceImportRowsByBatch(batch.id);
  return { batch, rows };
}
