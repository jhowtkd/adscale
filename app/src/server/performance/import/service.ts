import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "../../db";
import { getCampaignById } from "../../repositories/campaign";
import { getDerivationsByCampaign } from "../../repositories/derivation";
import {
  createPerformanceImportBatch,
  createPerformanceImportRow,
  getPerformanceImportBatchById,
  listPerformanceImportBatchesByCampaign,
  listPerformanceImportRowsByBatch,
  updatePerformanceImportBatchCounts,
} from "../../repositories/performance-import";
import {
  getPerformanceSnapshotBySourceKey,
  listPerformanceSnapshotsByCampaign,
} from "../../repositories/performance";
import { dispatchLearningRecomputeForCampaign } from "../learning/dispatch";
import { PerformanceDomainError, recordPerformanceSnapshot } from "../service";
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
} from "./types";
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
  await assertCampaignAccess(input.campaignId, input.workspaceId);

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

    for (const row of input.preview.rows) {
      if (row.status === "invalid") {
        await createPerformanceImportRow(
          {
            batchId: batch.id,
            rowIndex: row.rowIndex,
            status: "invalid",
            errors: row.errors,
            snapshotId: null,
            sourceKey: null,
          },
          tx
        );
        continue;
      }

      const canonical = row.canonical!;
      const existing = row.sourceKey
        ? await getPerformanceSnapshotBySourceKey(
            row.sourceKey,
            input.workspaceId
          )
        : null;

      let status: ImportRowStatus;
      let snapshotId: string | null = null;

      if (existing && snapshotMatchesInput(existing, canonical)) {
        status = "ignored";
        snapshotId = existing.id;
        counts.ignoredCount += 1;
      } else {
        const saved = await recordPerformanceSnapshot({
          workspaceId: input.workspaceId,
          userId: input.userId,
          snapshot: {
            ...canonical,
            sourceMetadata: {
              importBatchId: batch.id,
              importRowIndex: row.rowIndex,
            },
          },
        });

        if (existing) {
          status = "updated";
          counts.updatedCount += 1;
        } else {
          status = "created";
          counts.createdCount += 1;
        }
        snapshotId = saved.id;
      }

      await createPerformanceImportRow(
        {
          batchId: batch.id,
          rowIndex: row.rowIndex,
          status,
          errors: null,
          snapshotId,
          sourceKey: row.sourceKey ?? null,
        },
        tx
      );
    }

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
