import type { CreativePerformanceSnapshot } from "../../db/schema";
import { normalizePlacement } from "../placement";
import { buildPerformanceSourceKey } from "../source-key";
import {
  canonicalPerformanceSnapshotInputSchema,
  type CanonicalPerformanceSnapshotInput,
} from "../validation";
import { mapCsvRow } from "./map-row";
import {
  normalizeCurrency,
  normalizeDateString,
  normalizeIntegerString,
  normalizeNumericString,
} from "./normalize";
import type {
  ColumnMapping,
  ImportFieldError,
  ImportPreviewResult,
  ImportPreviewSummary,
  ManualImportInput,
  ParseOptions,
  PreviewRow,
  RawMappedRow,
  UpsertClassification,
} from "./types";
import { PERFORMANCE_PLATFORMS } from "../types";

function zodErrorsToFieldErrors(
  issues: { path: (string | number)[]; message: string }[]
): ImportFieldError[] {
  return issues.map((issue) => ({
    field: issue.path.join(".") || "row",
    message: issue.message,
  }));
}

function snapshotMatchesInput(
  existing: CreativePerformanceSnapshot,
  input: CanonicalPerformanceSnapshotInput
): boolean {
  return (
    existing.impressions === input.metrics.impressions &&
    existing.clicks === input.metrics.clicks &&
    existing.spend === input.metrics.spend &&
    existing.conversions === input.metrics.conversions &&
    existing.conversionValue === input.metrics.conversionValue &&
    existing.currency === input.currency &&
    existing.placementRaw === input.placementRaw.trim() &&
    existing.startDate === input.startDate &&
    existing.endDate === input.endDate &&
    existing.sourceTimezone === input.sourceTimezone &&
    (existing.adAccountId ?? null) === (input.adAccountId ?? null) &&
    (existing.externalCampaignId ?? null) ===
      (input.externalCampaignId ?? null) &&
    (existing.externalAdGroupId ?? null) === (input.externalAdGroupId ?? null) &&
    (existing.externalAdId ?? null) === (input.externalAdId ?? null)
  );
}

function classifyRow(
  canonical: CanonicalPerformanceSnapshotInput,
  existingBySourceKey: Map<string, CreativePerformanceSnapshot>
): { classification: UpsertClassification; sourceKey: string } {
  const normalizedPlacement = normalizePlacement(
    canonical.platform,
    canonical.placementRaw
  );
  const sourceKey = buildPerformanceSourceKey({
    derivationId: canonical.derivationId,
    platform: canonical.platform,
    placement: normalizedPlacement.placement,
    adAccountId: canonical.adAccountId,
    startDate: canonical.startDate,
    endDate: canonical.endDate,
    sourceType: canonical.sourceType,
    externalCampaignId: canonical.externalCampaignId,
    externalAdGroupId: canonical.externalAdGroupId,
    externalAdId: canonical.externalAdId,
    scope: canonical.scope,
  });

  const existing = existingBySourceKey.get(sourceKey);
  if (!existing) {
    return { classification: "wouldCreate", sourceKey };
  }
  if (snapshotMatchesInput(existing, canonical)) {
    return { classification: "wouldIgnore", sourceKey };
  }
  return { classification: "wouldUpdate", sourceKey };
}

function normalizeRawRow(
  raw: RawMappedRow,
  parseOptions: ParseOptions,
  campaignId: string,
  sourceType: "manual" | "csv",
  derivationIds: Set<string>
): { canonical?: CanonicalPerformanceSnapshotInput; errors: ImportFieldError[] } {
  const errors: ImportFieldError[] = [];

  if (raw.derivationId && !derivationIds.has(raw.derivationId)) {
    errors.push({
      field: "derivationId",
      message: "Derivation not found in campaign",
      rawValue: raw.derivationId,
    });
  }

  const impressions = raw.impressions
    ? normalizeIntegerString(raw.impressions, parseOptions)
    : { value: null, error: "Value is required" };
  if (impressions.error) {
    errors.push({
      field: "impressions",
      message: impressions.error,
      rawValue: raw.impressions,
    });
  }

  const clicks = raw.clicks
    ? normalizeIntegerString(raw.clicks, parseOptions)
    : { value: null, error: "Value is required" };
  if (clicks.error) {
    errors.push({
      field: "clicks",
      message: clicks.error,
      rawValue: raw.clicks,
    });
  }

  const spend = raw.spend
    ? normalizeNumericString(raw.spend, parseOptions)
    : { value: null, error: "Value is required" };
  if (spend.error) {
    errors.push({ field: "spend", message: spend.error, rawValue: raw.spend });
  }

  const conversions = raw.conversions
    ? normalizeNumericString(raw.conversions, parseOptions)
    : { value: null, error: "Value is required" };
  if (conversions.error) {
    errors.push({
      field: "conversions",
      message: conversions.error,
      rawValue: raw.conversions,
    });
  }

  const conversionValue = raw.conversionValue
    ? normalizeNumericString(raw.conversionValue, parseOptions)
    : { value: null, error: "Value is required" };
  if (conversionValue.error) {
    errors.push({
      field: "conversionValue",
      message: conversionValue.error,
      rawValue: raw.conversionValue,
    });
  }

  const startDate = raw.startDate
    ? normalizeDateString(raw.startDate)
    : { value: null, error: "Value is required" };
  if (startDate.error) {
    errors.push({
      field: "startDate",
      message: startDate.error,
      rawValue: raw.startDate,
    });
  }

  const endDate = raw.endDate
    ? normalizeDateString(raw.endDate)
    : { value: null, error: "Value is required" };
  if (endDate.error) {
    errors.push({
      field: "endDate",
      message: endDate.error,
      rawValue: raw.endDate,
    });
  }

  const currency = normalizeCurrency(raw.currency, parseOptions.defaultCurrency);
  if (currency.error) {
    errors.push({
      field: "currency",
      message: currency.error,
      rawValue: raw.currency,
    });
  }

  const platform = raw.platform?.trim().toLowerCase();
  if (!platform || !PERFORMANCE_PLATFORMS.includes(platform as never)) {
    errors.push({
      field: "platform",
      message: "Invalid platform",
      rawValue: raw.platform,
    });
  }

  if (!raw.placementRaw?.trim()) {
    errors.push({
      field: "placementRaw",
      message: "Placement is required",
      rawValue: raw.placementRaw,
    });
  }

  if (!raw.derivationId?.trim()) {
    errors.push({
      field: "derivationId",
      message: "Derivation is required",
      rawValue: raw.derivationId,
    });
  }

  if (errors.length > 0) {
    return { errors };
  }

  const candidate: CanonicalPerformanceSnapshotInput = {
    campaignId,
    derivationId: raw.derivationId!,
    platform: platform as CanonicalPerformanceSnapshotInput["platform"],
    placementRaw: raw.placementRaw!.trim(),
    adAccountId: raw.adAccountId ?? null,
    startDate: startDate.value!,
    endDate: endDate.value!,
    sourceTimezone: raw.sourceTimezone?.trim() || parseOptions.sourceTimezone,
    currency: currency.value!,
    sourceType,
    externalCampaignId: raw.externalCampaignId ?? null,
    externalAdGroupId: raw.externalAdGroupId ?? null,
    externalAdId: raw.externalAdId ?? null,
    scope: { kind: "total" },
    metrics: {
      impressions: impressions.value!,
      clicks: clicks.value!,
      spend: spend.value!,
      conversions: conversions.value!,
      conversionValue: conversionValue.value!,
    },
  };

  const parsed = canonicalPerformanceSnapshotInputSchema.safeParse(candidate);
  if (!parsed.success) {
    return { errors: zodErrorsToFieldErrors(parsed.error.issues) };
  }

  return { canonical: parsed.data, errors: [] };
}

function summarizeRows(rows: PreviewRow[]): ImportPreviewSummary {
  const summary: ImportPreviewSummary = {
    total: rows.length,
    valid: 0,
    invalid: 0,
    wouldCreate: 0,
    wouldUpdate: 0,
    wouldIgnore: 0,
  };

  for (const row of rows) {
    if (row.status === "invalid") {
      summary.invalid += 1;
      continue;
    }
    summary.valid += 1;
    if (row.classification === "wouldCreate") summary.wouldCreate += 1;
    if (row.classification === "wouldUpdate") summary.wouldUpdate += 1;
    if (row.classification === "wouldIgnore") summary.wouldIgnore += 1;
  }

  return summary;
}

export function buildPreviewRows(input: {
  campaignId: string;
  sourceType: "manual" | "csv";
  parseOptions: ParseOptions;
  derivationIds: Set<string>;
  existingSnapshots: CreativePerformanceSnapshot[];
  headers?: string[];
  mappedRows: RawMappedRow[];
}): ImportPreviewResult {
  const existingBySourceKey = new Map(
    input.existingSnapshots.map((snapshot) => [snapshot.sourceKey, snapshot])
  );

  const rows: PreviewRow[] = input.mappedRows.map((raw, index) => {
    const { canonical, errors } = normalizeRawRow(
      raw,
      input.parseOptions,
      input.campaignId,
      input.sourceType,
      input.derivationIds
    );

    if (!canonical || errors.length > 0) {
      return {
        rowIndex: index,
        status: "invalid" as const,
        errors,
      };
    }

    const { classification, sourceKey } = classifyRow(
      canonical,
      existingBySourceKey
    );

    return {
      rowIndex: index,
      status: "valid" as const,
      errors: [],
      classification,
      sourceKey,
      canonical,
    };
  });

  return {
    rows,
    summary: summarizeRows(rows),
    headers: input.headers,
  };
}

export function previewFromCsvRows(input: {
  campaignId: string;
  headers: string[];
  rows: string[][];
  columnMapping: ColumnMapping;
  parseOptions: ParseOptions;
  derivationIds: Set<string>;
  existingSnapshots: CreativePerformanceSnapshot[];
  detectedDelimiter?: "," | ";";
  fileHash?: string;
  fileName?: string;
}): ImportPreviewResult {
  const mappedRows = input.rows.map((row) =>
    mapCsvRow(input.headers, row, input.columnMapping)
  );

  const result = buildPreviewRows({
    campaignId: input.campaignId,
    sourceType: "csv",
    parseOptions: input.parseOptions,
    derivationIds: input.derivationIds,
    existingSnapshots: input.existingSnapshots,
    headers: input.headers,
    mappedRows,
  });

  return {
    ...result,
    detectedDelimiter: input.detectedDelimiter,
    fileHash: input.fileHash,
    fileName: input.fileName,
  };
}

export function previewFromManualRow(input: {
  campaignId: string;
  manual: ManualImportInput;
  parseOptions: ParseOptions;
  derivationIds: Set<string>;
  existingSnapshots: CreativePerformanceSnapshot[];
}): ImportPreviewResult {
  const raw: RawMappedRow = {
    derivationId: input.manual.derivationId,
    platform: input.manual.platform,
    placementRaw: input.manual.placementRaw,
    startDate: input.manual.startDate,
    endDate: input.manual.endDate,
    impressions: input.manual.impressions,
    clicks: input.manual.clicks,
    spend: input.manual.spend,
    conversions: input.manual.conversions,
    conversionValue: input.manual.conversionValue,
    currency: input.manual.currency,
    adAccountId: input.manual.adAccountId ?? undefined,
    externalCampaignId: input.manual.externalCampaignId ?? undefined,
    externalAdGroupId: input.manual.externalAdGroupId ?? undefined,
    externalAdId: input.manual.externalAdId ?? undefined,
    sourceTimezone: input.manual.sourceTimezone,
  };

  return buildPreviewRows({
    campaignId: input.campaignId,
    sourceType: "manual",
    parseOptions: input.parseOptions,
    derivationIds: input.derivationIds,
    existingSnapshots: input.existingSnapshots,
    mappedRows: [raw],
  });
}

export { classifyRow, snapshotMatchesInput };
