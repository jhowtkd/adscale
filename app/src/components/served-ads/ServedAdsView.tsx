"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Image as ImageIcon, LayoutGrid, Megaphone, Video } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { apiFetch } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type WindowDays = "7" | "30" | "90";
type FormatFilter = "all" | "imagem" | "video" | "carrossel";

interface ServedAdRow {
  anuncioId: string;
  format: "imagem" | "video" | "carrossel";
  text: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number | null;
  ctr: number | null;
  cpc: number | null;
  cpa: number | null;
  conversion: {
    definitionVersion: number;
    actionType: string | null;
    value: number | null;
    status: "measured" | "not_defined" | "incomplete" | "incompatible" | "legacy_unverified";
  };
  insufficientEvidence: boolean;
  previewUrl: string | null;
}

interface ServedAdsReport {
  mode: "live" | "fixture";
  currencies: string[];
  primaryCurrency: string;
  hasConversions: boolean;
  rows: ServedAdRow[];
}

const FORMAT_ICONS = {
  imagem: ImageIcon,
  video: Video,
  carrossel: LayoutGrid,
} as const;

const WINDOW_LABELS = { "7": "window7", "30": "window30", "90": "window90" } as const;
const FORMAT_LABELS = {
  imagem: "formatImagem",
  video: "formatVideo",
  carrossel: "formatCarrossel",
} as const;

function formatMoney(value: number | null, locale: string, currency: string): string {
  if (value === null) return "—";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatInt(value: number | null, locale: string): string {
  if (value === null) return "—";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

function formatPct(value: number | null, locale: string): string {
  if (value === null) return "—";
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}%`;
}

/**
 * Superfície Anúncios veiculados (#346): 5º destino, contexto da marca ativa.
 * Lista por CTR com piso de 1.000 impressões; sem Conexão Meta, fixture.
 */
export function ServedAdsView() {
  const t = useTranslations("servedAds");
  const locale = useLocale();
  const brandId = useAppStore((s) => s.activeClientProfileId);
  const [windowDays, setWindowDays] = useState<WindowDays>("30");
  const [format, setFormat] = useState<FormatFilter>("all");
  // Relatório + falha versionados pela chave da busca: sem setState
  // síncrono no efeito, e resposta atrasada nunca sobrescreve a atual.
  const [loaded, setLoaded] = useState<{ key: string; report: ServedAdsReport } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const key = `${brandId ?? ""}|${windowDays}|${format}`;

  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    const params = new URLSearchParams({ brandId, window: windowDays });
    if (format !== "all") params.set("format", format);
    apiFetch(`/api/served-ads?${params.toString()}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setFailedKey(key);
          return;
        }
        setFailedKey(null);
        setLoaded({ key, report: (await res.json()) as ServedAdsReport });
      })
      .catch(() => {
        if (!cancelled) setFailedKey(key);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, windowDays, format, key]);

  const report = loaded?.key === key ? loaded.report : null;
  const failed = failedKey === key;
  const loading = brandId !== null && !report && !failed;

  if (!brandId) {
    return (
      <EmptyState
        icon={Megaphone}
        title={t("noBrandTitle")}
        description={t("noBrandDescription")}
        action={{ label: t("noBrandAction"), href: "/brand-kit" }}
      />
    );
  }

  const segmented = (active: boolean) =>
    cn(
      "rounded-full px-3 py-1 text-xs font-medium transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
      active
        ? "bg-[var(--active-navigation-bg)] text-[var(--active-navigation-text)]"
        : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
    );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">{t("title")}</h1>
          <p className="text-sm text-[var(--text-muted)]">{t("subtitle")}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {report?.mode === "fixture" ? (
            <span
              data-testid="served-ads-fixture-badge"
              className="rounded-full bg-[var(--surface-inset)] px-2.5 py-0.5 text-xs text-[var(--text-muted)]"
            >
              {t("fixtureBadge")}
            </span>
          ) : null}
          {report && report.currencies.length > 1 ? (
            <span className="rounded-full bg-[var(--surface-inset)] px-2.5 py-0.5 text-xs text-[var(--text-muted)]">
              {t("multiCurrency")}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t("title")} className="flex items-center gap-1">
          {(["7", "30", "90"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={windowDays === value}
              data-testid={`served-ads-window-${value}`}
              onClick={() => setWindowDays(value)}
              className={segmented(windowDays === value)}
            >
              {t(WINDOW_LABELS[value])}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-[var(--border-subtle)]" aria-hidden />
        <div role="group" className="flex items-center gap-1">
          {(["all", "imagem", "video", "carrossel"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={format === value}
              data-testid={`served-ads-format-${value}`}
              onClick={() => setFormat(value)}
              className={segmented(format === value)}
            >
              {value === "all" ? t("formatAll") : t(FORMAT_LABELS[value])}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p role="status" className="text-sm text-[var(--text-muted)]">{t("loading")}</p>
      ) : null}
      {failed ? (
        <p role="alert" className="text-sm text-[var(--danger-text)]">{t("loadError")}</p>
      ) : null}
      {report && report.rows.length === 0 ? (
        <EmptyState icon={Megaphone} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : null}
      {report && report.rows.length > 0 ? (
        <div className="overflow-x-auto rounded-[var(--radius-object)] border border-[var(--border-subtle)]">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <th scope="col" className="px-3 py-2 font-medium">{t("colCreative")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("colSpend")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("colImpressions")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("colCtr")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("colCpc")}</th>
                {report.hasConversions ? (
                  <>
                    <th scope="col" className="px-3 py-2 text-right font-medium">{t("colResults")}</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">{t("colCpa")}</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => {
                const FormatIcon = FORMAT_ICONS[row.format];
                return (
                  <tr
                    key={row.anuncioId}
                    data-testid="served-ad-row"
                    className="border-b border-[var(--border-subtle)] last:border-0"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-[var(--surface-inset)] text-[var(--text-muted)]">
                          {row.previewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={row.previewUrl} alt="" className="size-full object-cover" />
                          ) : (
                            <FormatIcon size={18} aria-hidden />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block max-w-[280px] truncate text-[var(--text-primary)]">
                            {row.text ?? "—"}
                          </span>
                          {row.insufficientEvidence ? (
                            <span className="text-xs text-[var(--text-muted)]">
                              {t("insufficientEvidence")}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-primary)]">
                      {formatMoney(row.spend, locale, report.primaryCurrency)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-primary)]">
                      {formatInt(row.impressions, locale)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-[var(--text-primary)]">
                      {formatPct(row.ctr, locale)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-primary)]">
                      {formatMoney(row.cpc, locale, report.primaryCurrency)}
                    </td>
                    {report.hasConversions ? (
                      <>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--text-primary)]">
                          {formatInt(row.conversions, locale)}
                          {row.conversion.status !== "measured" ? (
                            <span className="block text-xs font-normal text-[var(--text-muted)]">
                              {t("unverifiedMeasure")}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--text-primary)]">
                          {formatMoney(row.cpa, locale, report.primaryCurrency)}
                        </td>
                      </>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
