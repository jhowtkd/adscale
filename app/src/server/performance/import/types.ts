import type { CanonicalPerformanceSnapshotInput } from "../validation";

export type ImportSourceType = "manual" | "csv";

export type DecimalSeparator = "." | ",";
export type PercentFormat = "fraction" | "percent";
export type ImportLocale = "pt-BR" | "en-US";

export const REQUIRED_CSV_COLUMNS = [
  "derivationId",
  "platform",
  "placementRaw",
  "startDate",
  "endDate",
  "impressions",
  "clicks",
  "spend",
  "conversions",
  "conversionValue",
  "currency",
] as const;

export const OPTIONAL_CSV_COLUMNS = [
  "adAccountId",
  "externalCampaignId",
  "externalAdGroupId",
  "externalAdId",
  "sourceTimezone",
] as const;

export type RequiredCsvColumn = (typeof REQUIRED_CSV_COLUMNS)[number];
export type OptionalCsvColumn = (typeof OPTIONAL_CSV_COLUMNS)[number];
export type MappableCsvColumn = RequiredCsvColumn | OptionalCsvColumn;

/** Maps canonical field names to CSV header names. */
export type ColumnMapping = Record<MappableCsvColumn, string>;

export interface ParseOptions {
  defaultCurrency: string;
  locale: ImportLocale;
  decimalSeparator: DecimalSeparator;
  percentFormat: PercentFormat;
  sourceTimezone: string;
}

export interface ImportFieldError {
  field: string;
  message: string;
  rawValue?: string;
}

export type PreviewRowStatus = "valid" | "invalid";
export type UpsertClassification = "wouldCreate" | "wouldUpdate" | "wouldIgnore";
export type ImportRowStatus = "created" | "updated" | "ignored" | "invalid";

export interface PreviewRow {
  rowIndex: number;
  status: PreviewRowStatus;
  errors: ImportFieldError[];
  classification?: UpsertClassification;
  sourceKey?: string;
  canonical?: CanonicalPerformanceSnapshotInput;
}

export interface ImportPreviewSummary {
  total: number;
  valid: number;
  invalid: number;
  wouldCreate: number;
  wouldUpdate: number;
  wouldIgnore: number;
}

export interface ImportPreviewResult {
  rows: PreviewRow[];
  summary: ImportPreviewSummary;
  headers?: string[];
  detectedDelimiter?: "," | ";";
  fileHash?: string;
  fileName?: string;
}

export interface ManualImportInput {
  derivationId: string;
  platform: string;
  placementRaw: string;
  startDate: string;
  endDate: string;
  impressions: string;
  clicks: string;
  spend: string;
  conversions: string;
  conversionValue: string;
  currency?: string;
  adAccountId?: string | null;
  externalCampaignId?: string | null;
  externalAdGroupId?: string | null;
  externalAdId?: string | null;
  sourceTimezone?: string;
}

export interface RawMappedRow {
  derivationId?: string;
  platform?: string;
  placementRaw?: string;
  startDate?: string;
  endDate?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  conversions?: string;
  conversionValue?: string;
  currency?: string;
  adAccountId?: string;
  externalCampaignId?: string;
  externalAdGroupId?: string;
  externalAdId?: string;
  sourceTimezone?: string;
}

export const CSV_MAX_ROWS = 10_000;
export const CSV_MAX_BYTES = 5 * 1024 * 1024;
