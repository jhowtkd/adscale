"use client";

import { useCallback, useMemo, useState } from "react";
import { PERFORMANCE_PLATFORMS } from "@/server/performance/types";
import type { ColumnMapping, ImportPreviewResult } from "@/server/performance/import/types";
import { REQUIRED_CSV_COLUMNS } from "@/server/performance/import/types";
import {
  buildAutoColumnMapping,
  defaultParseOptions,
  extractCsvHeaders,
  useConfirmPerformanceImport,
  usePerformanceImportBatches,
  usePreviewCsvImport,
  usePreviewManualImport,
  type ManualImportInput,
  type ParseOptions,
} from "@/lib/hooks/use-performance-import";

type PanelTab = "manual" | "csv" | "history";

interface DerivationOption {
  id: string;
  label: string;
}

interface PerformanceImportPanelProps {
  campaignId: string;
  derivations: DerivationOption[];
}

const emptyManual: ManualImportInput = {
  derivationId: "",
  platform: "meta",
  placementRaw: "feed",
  startDate: "",
  endDate: "",
  impressions: "",
  clicks: "",
  spend: "",
  conversions: "",
  conversionValue: "",
  currency: "BRL",
};

export default function PerformanceImportPanel({
  campaignId,
  derivations,
}: PerformanceImportPanelProps) {
  const [tab, setTab] = useState<PanelTab>("manual");
  const [manual, setManual] = useState<ManualImportInput>(emptyManual);
  const [parseOptions, setParseOptions] = useState<ParseOptions>(defaultParseOptions);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Partial<ColumnMapping>>({});
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const batchesQuery = usePerformanceImportBatches(campaignId);
  const previewManual = usePreviewManualImport(campaignId);
  const previewCsv = usePreviewCsvImport(campaignId);
  const confirmImport = useConfirmPerformanceImport(campaignId);

  const mappingComplete = useMemo(
    () => REQUIRED_CSV_COLUMNS.every((field) => columnMapping[field]?.trim()),
    [columnMapping]
  );

  const handleCsvFile = useCallback(async (file: File) => {
    setCsvFile(file);
    setPreview(null);
    setMessage(null);
    const text = await file.text();
    const { headers } = extractCsvHeaders(text);
    setCsvHeaders(headers);
    setColumnMapping(buildAutoColumnMapping(headers));
  }, []);

  const handleManualPreview = async () => {
    setMessage(null);
    try {
      const result = await previewManual.mutateAsync({ manual, parseOptions });
      setPreview(result);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro na pré-visualização");
    }
  };

  const handleCsvPreview = async () => {
    if (!csvFile || !mappingComplete) return;
    setMessage(null);
    try {
      const result = await previewCsv.mutateAsync({
        file: csvFile,
        columnMapping: columnMapping as ColumnMapping,
        parseOptions,
      });
      setPreview(result);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro na pré-visualização");
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setMessage(null);
    try {
      const result = await confirmImport.mutateAsync({
        sourceType: tab === "csv" ? "csv" : "manual",
        preview,
        parseOptions,
        file: tab === "csv" ? csvFile : null,
        columnMapping: tab === "csv" ? (columnMapping as ColumnMapping) : null,
      });
      setMessage(
        `Importação concluída: ${result.createdCount} criados, ${result.updatedCount} atualizados, ${result.ignoredCount} ignorados, ${result.invalidCount} inválidos.`
      );
      setPreview(null);
      setCsvFile(null);
      setCsvHeaders([]);
      setColumnMapping({});
      setManual(emptyManual);
      setTab("history");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro ao confirmar importação");
    }
  };

  const isPreviewing = previewManual.isPending || previewCsv.isPending;
  const isConfirming = confirmImport.isPending;

  return (
    <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-1)] p-4 space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["manual", "csv", "history"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === key
                ? "bg-[var(--accent-green)] text-white"
                : "bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {key === "manual" ? "Manual" : key === "csv" ? "CSV" : "Histórico"}
          </button>
        ))}
      </div>

      {message ? (
        <p className="text-sm text-[var(--text-secondary)]" role="status">
          {message}
        </p>
      ) : null}

      {tab === "manual" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs space-y-1">
            <span className="text-[var(--text-secondary)]">Derivação</span>
            <select
              className="w-full rounded border border-[var(--border-dim)] bg-[var(--surface-2)] px-2 py-1.5 text-sm"
              value={manual.derivationId}
              onChange={(e) => setManual((m) => ({ ...m, derivationId: e.target.value }))}
            >
              <option value="">Selecione…</option>
              {derivations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="text-[var(--text-secondary)]">Plataforma</span>
            <select
              className="w-full rounded border border-[var(--border-dim)] bg-[var(--surface-2)] px-2 py-1.5 text-sm"
              value={manual.platform}
              onChange={(e) => setManual((m) => ({ ...m, platform: e.target.value }))}
            >
              {PERFORMANCE_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          {(
            [
              ["placementRaw", "Placement"],
              ["startDate", "Início (AAAA-MM-DD)"],
              ["endDate", "Fim (AAAA-MM-DD)"],
              ["impressions", "Impressões"],
              ["clicks", "Cliques"],
              ["spend", "Investimento"],
              ["conversions", "Conversões"],
              ["conversionValue", "Valor conversão"],
              ["currency", "Moeda"],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="text-xs space-y-1">
              <span className="text-[var(--text-secondary)]">{label}</span>
              <input
                className="w-full rounded border border-[var(--border-dim)] bg-[var(--surface-2)] px-2 py-1.5 text-sm"
                value={manual[field] ?? ""}
                onChange={(e) => setManual((m) => ({ ...m, [field]: e.target.value }))}
              />
            </label>
          ))}
          <div className="sm:col-span-2 flex gap-2">
            <button
              type="button"
              disabled={isPreviewing || !manual.derivationId}
              onClick={() => void handleManualPreview()}
              className="rounded-md bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              Pré-visualizar
            </button>
          </div>
        </div>
      ) : null}

      {tab === "csv" ? (
        <div className="space-y-4">
          <label className="block text-xs space-y-1">
            <span className="text-[var(--text-secondary)]">Arquivo CSV</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="block w-full text-sm"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleCsvFile(file);
              }}
            />
          </label>

          {csvHeaders.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {REQUIRED_CSV_COLUMNS.map((field) => (
                <label key={field} className="text-xs space-y-1">
                  <span className="text-[var(--text-secondary)]">{field}</span>
                  <select
                    className="w-full rounded border border-[var(--border-dim)] bg-[var(--surface-2)] px-2 py-1.5 text-sm"
                    value={columnMapping[field] ?? ""}
                    onChange={(e) =>
                      setColumnMapping((m) => ({ ...m, [field]: e.target.value }))
                    }
                  >
                    <option value="">—</option>
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          ) : null}

          <ParseOptionsFields
            parseOptions={parseOptions}
            onChange={setParseOptions}
          />

          <button
            type="button"
            disabled={!csvFile || !mappingComplete || isPreviewing}
            onClick={() => void handleCsvPreview()}
            className="rounded-md bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            Pré-visualizar CSV
          </button>
        </div>
      ) : null}

      {tab === "history" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--text-secondary)]">
                <th className="py-1 pr-2">Data</th>
                <th className="py-1 pr-2">Tipo</th>
                <th className="py-1 pr-2">Arquivo</th>
                <th className="py-1 pr-2">C/U/I/X</th>
              </tr>
            </thead>
            <tbody>
              {(batchesQuery.data ?? []).map((batch) => (
                <tr key={batch.id} className="border-t border-[var(--border-dim)]">
                  <td className="py-2 pr-2">
                    {new Date(batch.createdAt).toLocaleString("pt-BR")}
                  </td>
                  <td className="py-2 pr-2">{batch.sourceType}</td>
                  <td className="py-2 pr-2">{batch.fileName ?? "—"}</td>
                  <td className="py-2 pr-2">
                    {batch.createdCount}/{batch.updatedCount}/{batch.ignoredCount}/
                    {batch.invalidCount}
                  </td>
                </tr>
              ))}
              {!batchesQuery.data?.length ? (
                <tr>
                  <td colSpan={4} className="py-4 text-[var(--text-secondary)]">
                    Nenhuma importação registrada.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {preview && tab !== "history" ? (
        <PreviewTable preview={preview} onConfirm={() => void handleConfirm()} confirming={isConfirming} />
      ) : null}
    </div>
  );
}

function ParseOptionsFields({
  parseOptions,
  onChange,
}: {
  parseOptions: ParseOptions;
  onChange: (value: ParseOptions) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs space-y-1">
        <span className="text-[var(--text-secondary)]">Moeda padrão</span>
        <input
          className="w-full rounded border border-[var(--border-dim)] bg-[var(--surface-2)] px-2 py-1.5 text-sm uppercase"
          value={parseOptions.defaultCurrency}
          onChange={(e) =>
            onChange({ ...parseOptions, defaultCurrency: e.target.value.toUpperCase() })
          }
        />
      </label>
      <label className="text-xs space-y-1">
        <span className="text-[var(--text-secondary)]">Locale</span>
        <select
          className="w-full rounded border border-[var(--border-dim)] bg-[var(--surface-2)] px-2 py-1.5 text-sm"
          value={parseOptions.locale}
          onChange={(e) =>
            onChange({ ...parseOptions, locale: e.target.value as ParseOptions["locale"] })
          }
        >
          <option value="pt-BR">pt-BR</option>
          <option value="en-US">en-US</option>
        </select>
      </label>
      <label className="text-xs space-y-1">
        <span className="text-[var(--text-secondary)]">Separador decimal</span>
        <select
          className="w-full rounded border border-[var(--border-dim)] bg-[var(--surface-2)] px-2 py-1.5 text-sm"
          value={parseOptions.decimalSeparator}
          onChange={(e) =>
            onChange({
              ...parseOptions,
              decimalSeparator: e.target.value as ParseOptions["decimalSeparator"],
            })
          }
        >
          <option value=",">,</option>
          <option value=".">.</option>
        </select>
      </label>
      <label className="text-xs space-y-1">
        <span className="text-[var(--text-secondary)]">Percentual</span>
        <select
          className="w-full rounded border border-[var(--border-dim)] bg-[var(--surface-2)] px-2 py-1.5 text-sm"
          value={parseOptions.percentFormat}
          onChange={(e) =>
            onChange({
              ...parseOptions,
              percentFormat: e.target.value as ParseOptions["percentFormat"],
            })
          }
        >
          <option value="percent">1,5%</option>
          <option value="fraction">0,015</option>
        </select>
      </label>
    </div>
  );
}

function PreviewTable({
  preview,
  onConfirm,
  confirming,
}: {
  preview: ImportPreviewResult;
  onConfirm: () => void;
  confirming: boolean;
}) {
  const { summary } = preview;
  return (
    <div className="space-y-3 border-t border-[var(--border-dim)] pt-3">
      <p className="text-xs text-[var(--text-secondary)]">
        {summary.valid} válidas · {summary.invalid} inválidas · {summary.wouldCreate}{" "}
        novas · {summary.wouldUpdate} atualizações · {summary.wouldIgnore} ignoradas
      </p>
      <div className="max-h-48 overflow-auto rounded border border-[var(--border-dim)]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--surface-2)]">
            <tr className="text-left text-[var(--text-secondary)]">
              <th className="p-2">#</th>
              <th className="p-2">Status</th>
              <th className="p-2">Ação</th>
              <th className="p-2">Erros</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.slice(0, 50).map((row) => (
              <tr key={row.rowIndex} className="border-t border-[var(--border-dim)]">
                <td className="p-2">{row.rowIndex + 1}</td>
                <td className="p-2">{row.status}</td>
                <td className="p-2">{row.classification ?? "—"}</td>
                <td className="p-2 text-[var(--accent-rose)]">
                  {row.errors.map((e) => `${e.field}: ${e.message}`).join("; ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        disabled={confirming || summary.valid === 0}
        onClick={onConfirm}
        className="rounded-md bg-[var(--accent-green)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        Confirmar importação
      </button>
    </div>
  );
}
