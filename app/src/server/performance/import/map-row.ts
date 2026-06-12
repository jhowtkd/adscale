import type { ColumnMapping, RawMappedRow } from "./types";
import { REQUIRED_CSV_COLUMNS } from "./types";

function headerIndex(headers: string[], headerName: string): number {
  const normalized = headerName.trim().toLowerCase();
  return headers.findIndex((header) => header.trim().toLowerCase() === normalized);
}

function readMappedValue(
  headers: string[],
  row: string[],
  csvHeader: string | undefined
): string | undefined {
  if (!csvHeader) return undefined;
  const index = headerIndex(headers, csvHeader);
  if (index < 0) return undefined;
  return row[index]?.trim();
}

export function mapCsvRow(
  headers: string[],
  row: string[],
  columnMapping: ColumnMapping
): RawMappedRow {
  const mapped: RawMappedRow = {};

  for (const [field, csvHeader] of Object.entries(columnMapping)) {
    const value = readMappedValue(headers, row, csvHeader);
    if (value !== undefined && value !== "") {
      mapped[field as keyof RawMappedRow] = value;
    }
  }

  return mapped;
}

export function isColumnMappingComplete(
  headers: string[],
  columnMapping: ColumnMapping
): { complete: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const field of REQUIRED_CSV_COLUMNS) {
    const csvHeader = columnMapping[field];
    if (!csvHeader?.trim()) {
      missing.push(field);
      continue;
    }
    if (headerIndex(headers, csvHeader) < 0) {
      missing.push(field);
    }
  }

  return { complete: missing.length === 0, missing };
}
