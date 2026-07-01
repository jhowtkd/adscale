"use client";

import { useCallback, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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

const MANUAL_FIELDS = [
  ["placementRaw", "placement"],
  ["startDate", "startDate"],
  ["endDate", "endDate"],
  ["impressions", "impressions"],
  ["clicks", "clicks"],
  ["spend", "spend"],
  ["conversions", "conversions"],
  ["conversionValue", "conversionValue"],
  ["currency", "currency"],
] as const;

export default function PerformanceImportPanel({
  campaignId,
  derivations,
}: PerformanceImportPanelProps) {
  const t = useTranslations("campaigns.performanceImport");
  const locale = useLocale();
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
    [columnMapping],
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
      setMessage(err instanceof Error ? err.message : t("errors.previewFailed"));
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
      setMessage(err instanceof Error ? err.message : t("errors.previewFailed"));
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
        t("confirmSuccess", {
          created: result.createdCount,
          updated: result.updatedCount,
          ignored: result.ignoredCount,
          invalid: result.invalidCount,
        }),
      );
      setPreview(null);
      setCsvFile(null);
      setCsvHeaders([]);
      setColumnMapping({});
      setManual(emptyManual);
      setTab("history");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("errors.confirmFailed"));
    }
  };

  const isPreviewing = previewManual.isPending || previewCsv.isPending;
  const isConfirming = confirmImport.isPending;

  return (
    <div className="space-y-4 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-4">
      <div className="flex flex-wrap gap-2">
        {(["manual", "csv", "history"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`min-h-9 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === key
                ? "border border-[var(--border-default)] bg-[var(--surface-inset)] text-[var(--text-primary)]"
                : "bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {t(`tabs.${key}`)}
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
          <label className="space-y-1 text-xs">
            <span className="text-[var(--text-secondary)]">{t("fields.derivation")}</span>
            <select
              className="w-full rounded border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 py-1.5 text-sm"
              value={manual.derivationId}
              onChange={(e) => setManual((m) => ({ ...m, derivationId: e.target.value }))}
            >
              <option value="">{t("select")}</option>
              {derivations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-[var(--text-secondary)]">{t("fields.platform")}</span>
            <select
              className="w-full rounded border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 py-1.5 text-sm"
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
          {MANUAL_FIELDS.map(([field, labelKey]) => (
            <label key={field} className="space-y-1 text-xs">
              <span className="text-[var(--text-secondary)]">{t(`fields.${labelKey}`)}</span>
              <input
                className="w-full rounded border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 py-1.5 text-sm"
                value={manual[field] ?? ""}
                onChange={(e) => setManual((m) => ({ ...m, [field]: e.target.value }))}
              />
            </label>
          ))}
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="button"
              disabled={isPreviewing || !manual.derivationId}
              onClick={() => void handleManualPreview()}
              className="min-h-9 rounded-md bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              {t("preview")}
            </button>
          </div>
        </div>
      ) : null}

      {tab === "csv" ? (
        <div className="space-y-4">
          <label className="block space-y-1 text-xs">
            <span className="text-[var(--text-secondary)]">{t("csvFile")}</span>
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
                <label key={field} className="space-y-1 text-xs">
                  <span className="text-[var(--text-secondary)]">{field}</span>
                  <select
                    className="w-full rounded border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 py-1.5 text-sm"
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

          <ParseOptionsFields parseOptions={parseOptions} onChange={setParseOptions} />

          <button
            type="button"
            disabled={!csvFile || !mappingComplete || isPreviewing}
            onClick={() => void handleCsvPreview()}
            className="min-h-9 rounded-md bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {t("previewCsv")}
          </button>
        </div>
      ) : null}

      {tab === "history" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--text-secondary)]">
                <th className="py-1 pr-2">{t("history.date")}</th>
                <th className="py-1 pr-2">{t("history.type")}</th>
                <th className="py-1 pr-2">{t("history.file")}</th>
                <th className="py-1 pr-2">{t("history.counts")}</th>
              </tr>
            </thead>
            <tbody>
              {(batchesQuery.data ?? []).map((batch) => (
                <tr key={batch.id} className="border-t border-[var(--border-dim)]">
                  <td className="py-2 pr-2">
                    {new Date(batch.createdAt).toLocaleString(locale)}
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
                    {t("history.empty")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {preview && tab !== "history" ? (
        <PreviewTable
          preview={preview}
          onConfirm={() => void handleConfirm()}
          confirming={isConfirming}
        />
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
  const t = useTranslations("campaigns.performanceImport.parseOptions");

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <label className="space-y-1 text-xs">
        <span className="text-[var(--text-secondary)]">{t("defaultCurrency")}</span>
        <input
          className="w-full rounded border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 py-1.5 text-sm uppercase"
          value={parseOptions.defaultCurrency}
          onChange={(e) =>
            onChange({ ...parseOptions, defaultCurrency: e.target.value.toUpperCase() })
          }
        />
      </label>
      <label className="space-y-1 text-xs">
        <span className="text-[var(--text-secondary)]">{t("locale")}</span>
        <select
          className="w-full rounded border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 py-1.5 text-sm"
          value={parseOptions.locale}
          onChange={(e) =>
            onChange({ ...parseOptions, locale: e.target.value as ParseOptions["locale"] })
          }
        >
          <option value="pt-BR">pt-BR</option>
          <option value="en-US">en-US</option>
        </select>
      </label>
      <label className="space-y-1 text-xs">
        <span className="text-[var(--text-secondary)]">{t("decimalSeparator")}</span>
        <select
          className="w-full rounded border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 py-1.5 text-sm"
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
      <label className="space-y-1 text-xs">
        <span className="text-[var(--text-secondary)]">{t("percentFormat")}</span>
        <select
          className="w-full rounded border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 py-1.5 text-sm"
          value={parseOptions.percentFormat}
          onChange={(e) =>
            onChange({
              ...parseOptions,
              percentFormat: e.target.value as ParseOptions["percentFormat"],
            })
          }
        >
          <option value="percent">{t("percentExample")}</option>
          <option value="fraction">{t("fractionExample")}</option>
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
  const t = useTranslations("campaigns.performanceImport");
  const { summary } = preview;

  return (
    <div className="space-y-3 border-t border-[var(--border-dim)] pt-3">
      <p className="text-xs text-[var(--text-secondary)]">
        {t("previewTable.summary", {
          valid: summary.valid,
          invalid: summary.invalid,
          create: summary.wouldCreate,
          update: summary.wouldUpdate,
          ignore: summary.wouldIgnore,
        })}
      </p>
      <div className="max-h-48 overflow-auto rounded border border-[var(--border-dim)]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--surface-raised)]">
            <tr className="text-left text-[var(--text-secondary)]">
              <th className="p-2">{t("previewTable.row")}</th>
              <th className="p-2">{t("previewTable.status")}</th>
              <th className="p-2">{t("previewTable.action")}</th>
              <th className="p-2">{t("previewTable.errors")}</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.slice(0, 50).map((row) => (
              <tr key={row.rowIndex} className="border-t border-[var(--border-dim)]">
                <td className="p-2">{row.rowIndex + 1}</td>
                <td className="p-2">{row.status}</td>
                <td className="p-2">{row.classification ?? "—"}</td>
                <td className="p-2 text-[var(--danger-text)]">
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
        className="min-h-9 rounded-md bg-[var(--accent-green)] px-3 py-1.5 text-xs font-medium text-[var(--accent-green-on-fill)] disabled:opacity-50"
      >
        {t("confirm")}
      </button>
    </div>
  );
}
