import { CSV_MAX_ROWS } from "./types";

export type CsvDelimiter = "," | ";";

export interface ParseCsvResult {
  headers: string[];
  rows: string[][];
  detectedDelimiter: CsvDelimiter;
  truncated: boolean;
}

export interface ParseCsvOptions {
  maxRows?: number;
  delimiter?: CsvDelimiter;
}

function detectDelimiter(firstLine: string): CsvDelimiter {
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const semicolonCount = (firstLine.match(/;/g) ?? []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

function parseCsvLine(line: string, delimiter: CsvDelimiter): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      fields.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  if (inQuotes) {
    throw new Error("Unclosed quoted field");
  }

  fields.push(current);
  return fields;
}

function splitCsvRecords(content: string): string[] {
  const records: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];

    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          current += '""';
          i += 1;
        } else {
          inQuotes = false;
          current += char;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      current += char;
      continue;
    }

    if (char === "\r") {
      if (content[i + 1] === "\n") {
        i += 1;
      }
      records.push(current);
      current = "";
      continue;
    }

    if (char === "\n") {
      records.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0 || records.length > 0) {
    records.push(current);
  }

  return records;
}

export function parseCsv(
  content: string,
  options: ParseCsvOptions = {}
): ParseCsvResult {
  const maxRows = options.maxRows ?? CSV_MAX_ROWS;
  const trimmed = content.replace(/^\uFEFF/, "").trim();

  if (!trimmed) {
    return {
      headers: [],
      rows: [],
      detectedDelimiter: options.delimiter ?? ",",
      truncated: false,
    };
  }

  const records = splitCsvRecords(trimmed).filter(
    (record, index) => record.length > 0 || index === 0
  );

  if (records.length === 0) {
    return {
      headers: [],
      rows: [],
      detectedDelimiter: options.delimiter ?? ",",
      truncated: false,
    };
  }

  const detectedDelimiter =
    options.delimiter ?? detectDelimiter(records[0] ?? "");
  const headers = parseCsvLine(records[0] ?? "", detectedDelimiter).map((h) =>
    h.trim()
  );

  const dataRecords = records.slice(1);
  const truncated = dataRecords.length > maxRows;
  const limitedRecords = truncated
    ? dataRecords.slice(0, maxRows)
    : dataRecords;

  const rows = limitedRecords.map((record) =>
    parseCsvLine(record, detectedDelimiter)
  );

  return {
    headers,
    rows,
    detectedDelimiter,
    truncated,
  };
}
