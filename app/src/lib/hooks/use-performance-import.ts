import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type {
  ColumnMapping,
  ImportPreviewResult,
  ManualImportInput,
  MappableCsvColumn,
  ParseOptions,
} from "@/server/performance/import/types";
import { REQUIRED_CSV_COLUMNS } from "@/server/performance/import/types";

export interface PerformanceImportBatch {
  id: string;
  campaignId: string;
  sourceType: "manual" | "csv";
  fileName: string | null;
  fileHash: string | null;
  createdCount: number;
  updatedCount: number;
  ignoredCount: number;
  invalidCount: number;
  createdAt: string;
}

export interface ConfirmImportResult {
  batchId: string;
  createdCount: number;
  updatedCount: number;
  ignoredCount: number;
  invalidCount: number;
}

const defaultParseOptions: ParseOptions = {
  defaultCurrency: "BRL",
  locale: "pt-BR",
  decimalSeparator: ",",
  percentFormat: "percent",
  sourceTimezone: "America/Sao_Paulo",
};

export function extractCsvHeaders(content: string): {
  headers: string[];
  delimiter: "," | ";";
} {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
  const semicolonCount = (firstLine.match(/;/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const delimiter: "," | ";" =
    semicolonCount > commaCount && commaCount === 0 ? ";" : ",";

  const headers: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < firstLine.length; i += 1) {
    const ch = firstLine[i];
    if (ch === '"') {
      if (inQuotes && firstLine[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delimiter) {
      headers.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  headers.push(current.trim());
  return { headers: headers.filter(Boolean), delimiter };
}

export function buildAutoColumnMapping(
  headers: string[]
): Partial<ColumnMapping> {
  const normalized = new Map(
    headers.map((h) => [h.toLowerCase().replace(/[\s_-]+/g, ""), h])
  );
  const aliases: Record<string, MappableCsvColumn> = {
    derivationid: "derivationId",
    derivacao: "derivationId",
    platform: "platform",
    plataforma: "platform",
    placement: "placementRaw",
    placementraw: "placementRaw",
    startdate: "startDate",
    datainicio: "startDate",
    enddate: "endDate",
    datafim: "endDate",
    impressions: "impressions",
    impressoes: "impressions",
    clicks: "clicks",
    cliques: "clicks",
    spend: "spend",
    investimento: "spend",
    gasto: "spend",
    conversions: "conversions",
    conversoes: "conversions",
    conversionvalue: "conversionValue",
    valorconversao: "conversionValue",
    currency: "currency",
    moeda: "currency",
  };

  const mapping: Partial<ColumnMapping> = {};
  for (const [alias, field] of Object.entries(aliases)) {
    const header = normalized.get(alias);
    if (header) {
      mapping[field] = header;
    }
  }
  return mapping;
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body?.error === "string" ? body.error : `Request failed (${res.status})`
    );
  }
  return res.json() as Promise<T>;
}

export function usePerformanceImportBatches(campaignId: string) {
  return useQuery({
    queryKey: ["performance-import-batches", campaignId],
    queryFn: async () => {
      const res = await apiFetch(
        `/api/campaigns/${campaignId}/performance/import/batches`
      );
      const data = await parseJsonResponse<{ batches: PerformanceImportBatch[] }>(
        res
      );
      return data.batches;
    },
    enabled: Boolean(campaignId && campaignId !== "new"),
  });
}

export function usePreviewManualImport(campaignId: string) {
  return useMutation({
    mutationFn: async (input: {
      manual: ManualImportInput;
      parseOptions?: ParseOptions;
    }) => {
      const res = await apiFetch(
        `/api/campaigns/${campaignId}/performance/import/preview`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            manual: input.manual,
            parseOptions: input.parseOptions ?? defaultParseOptions,
          }),
        }
      );
      const data = await parseJsonResponse<{ preview: ImportPreviewResult }>(res);
      return data.preview;
    },
  });
}

export function usePreviewCsvImport(campaignId: string) {
  return useMutation({
    mutationFn: async (input: {
      file: File;
      columnMapping: ColumnMapping;
      parseOptions?: ParseOptions;
    }) => {
      const formData = new FormData();
      formData.append("file", input.file);
      formData.append("columnMapping", JSON.stringify(input.columnMapping));
      formData.append(
        "parseOptions",
        JSON.stringify(input.parseOptions ?? defaultParseOptions)
      );
      const res = await apiFetch(
        `/api/campaigns/${campaignId}/performance/import/preview`,
        { method: "POST", body: formData, timeoutMs: 60_000 }
      );
      const data = await parseJsonResponse<{ preview: ImportPreviewResult }>(res);
      return data.preview;
    },
  });
}

export function useConfirmPerformanceImport(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sourceType: "manual" | "csv";
      preview: ImportPreviewResult;
      parseOptions?: ParseOptions;
      file?: File | null;
      columnMapping?: ColumnMapping | null;
    }) => {
      const parseOptions = input.parseOptions ?? defaultParseOptions;

      if (input.sourceType === "csv" && input.file && input.columnMapping) {
        const formData = new FormData();
        formData.append("file", input.file);
        formData.append("columnMapping", JSON.stringify(input.columnMapping));
        formData.append("parseOptions", JSON.stringify(parseOptions));
        const res = await apiFetch(
          `/api/campaigns/${campaignId}/performance/import/confirm`,
          { method: "POST", body: formData, timeoutMs: 120_000 }
        );
        const data = await parseJsonResponse<{ result: ConfirmImportResult }>(res);
        return data.result;
      }

      const res = await apiFetch(
        `/api/campaigns/${campaignId}/performance/import/confirm`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sourceType: input.sourceType,
            preview: input.preview,
            parseOptions,
            fileName: input.preview.fileName ?? null,
            fileHash: input.preview.fileHash ?? null,
            columnMapping: input.columnMapping ?? null,
          }),
        }
      );
      const data = await parseJsonResponse<{ result: ConfirmImportResult }>(res);
      return data.result;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["performance-import-batches", campaignId],
      });
    },
  });
}

export { defaultParseOptions, REQUIRED_CSV_COLUMNS };
export type { ColumnMapping, ImportPreviewResult, ManualImportInput, ParseOptions };
