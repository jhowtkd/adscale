import "server-only";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import {
  aggregateAdRows,
  buildAnuncioId,
  sortReportRows,
  type MetaAdRow,
  type ServedAdFormat,
  type ServedAdReportRow,
} from "./aggregate";
import {
  assertCompatibleLines,
  CONVERSION_DEFINITION_VERSION,
  consolidateCpa,
  type ComparabilityContext,
  type ConsolidationLine,
} from "./conversion";
import { describeEvent, listAvailableEvents, normalizeEventParam } from "./events";
import { getFixtureAdRows } from "./fixture";
import { hasMetaConnection, listServedAdRows } from "./repository";

export type ReportMode = "live" | "fixture";

export interface ServedAdsReportScope {
  brandId: string;
  workspaceId: string;
  windowDays: 7 | 30 | 90;
  format?: ServedAdFormat;
  /** Tipo de ação escolhido no escopo; null = não escolhido. */
  event: string | null;
  mode: ReportMode;
}

export interface ReportSourceRow {
  row: MetaAdRow;
  /** Contexto da coleta (snapshot live); null = fixture ou sem snapshot. */
  context: ComparabilityContext | null;
  currency: string;
  /** Chaves de mídia (live) para resolver preview; ausente no fixture. */
  media?: { imageKey: string | null; thumbKey: string | null };
}

export interface ReportEventRef {
  actionType: string | null;
  labelPtBR: string | null;
  labelEn: string | null;
  known: boolean;
}

export interface ReportEventOption {
  actionType: string;
  labelPtBR: string;
  labelEn: string;
  known: boolean;
}

export interface ServedAdsReportSummary {
  rows: number;
  impressions: number;
  clicks: number;
  spend: number;
  currencies: string[];
  /** Total do evento quando todas as linhas medem; senão null, nunca zero. */
  conversions: number | null;
  /** Gasto compatível / conversões do evento; null sem compatibilidade total. */
  cpa: number | null;
  cpaUnavailableReason: string | null;
  /** CTR do relatório é sempre cliques/impressões; nunca prova de conversão. */
  ctrDefinition: "clicks_divided_by_impressions";
  collectionComplete: boolean;
}

export interface ServedAdsReportMeta {
  event: ReportEventRef;
  availableEvents: ReportEventOption[];
  windowDays: 7 | 30 | 90;
  format: ServedAdFormat | "all";
  definitionVersion: typeof CONVERSION_DEFINITION_VERSION;
  mode: ReportMode;
  collectionComplete: boolean;
  generatedAt: string;
}

export interface ServedAdsReport {
  meta: ServedAdsReportMeta;
  summary: ServedAdsReportSummary;
  rows: ServedAdReportRow[];
}

export interface BuildReportInput {
  scope: ServedAdsReportScope;
  sources: ReportSourceRow[];
  now?: Date;
}

/** Contexto honesto do fixture: janela absoluta, origem mock, sem atribuição. */
export function fixtureComparability(windowDays: 7 | 30 | 90, now: Date): ComparabilityContext {
  return {
    definitionVersion: CONVERSION_DEFINITION_VERSION,
    currency: "BRL",
    periodStart: new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString(),
    periodEnd: now.toISOString(),
    windowDays,
    attribution: { status: "unknown", condition: "fixture_no_attribution" },
    completeness: "complete",
    origin: "mock",
  };
}

function effectiveContext(
  source: ReportSourceRow,
  scope: ServedAdsReportScope,
  now: Date
): ComparabilityContext | null {
  if (source.context) return source.context;
  if (scope.mode === "fixture") return fixtureComparability(scope.windowDays, now);
  return null;
}

/**
 * Contexto da linha do relatório: só quando todos os contribuidores do
 * anúncio partilham exatamente o mesmo contexto. Falta ou divergência
 * veta a linha na razão consolidada.
 */
function rowContext(
  sources: ReportSourceRow[],
  scope: ServedAdsReportScope,
  now: Date,
  anuncioId: string
): ComparabilityContext | null {
  let found: ComparabilityContext | null = null;
  let contributors = 0;
  for (const source of sources) {
    if (!source.row.creative_id) continue;
    if (buildAnuncioId(source.row.ad_account_id, source.row.creative_id) !== anuncioId) continue;
    contributors += 1;
    const current = effectiveContext(source, scope, now);
    if (!current) return null;
    if (!found) found = current;
    else if (JSON.stringify(found) !== JSON.stringify(current)) return null;
  }
  return contributors > 0 ? found : null;
}

function bilingualEvent(actionType: string): ReportEventOption {
  const ptBR = describeEvent(actionType, "pt-BR");
  const en = describeEvent(actionType, "en");
  return { actionType, labelPtBR: ptBR.label, labelEn: en.label, known: ptBR.known };
}

function unmeasuredReason(status: string): string {
  switch (status) {
    case "not_defined":
      return "event_not_defined";
    case "legacy_unverified":
      return "legacy_lines";
    case "incomplete":
      return "incomplete_lines";
    case "incompatible":
      return "incompatible_lines";
    default:
      return "unmeasured_lines";
  }
}

export function buildServedAdsReport(input: BuildReportInput): ServedAdsReport {
  const now = input.now ?? new Date();
  const { scope, sources } = input;
  const rows = sortReportRows(aggregateAdRows(sources.map((s) => s.row), { actionType: scope.event }));
  const collectionComplete = sources.every((s) => s.row.complete !== false);
  const currencies = [...new Set(sources.map((s) => s.currency))].sort();

  let conversions: number | null = null;
  let cpa: number | null = null;
  let cpaUnavailableReason: string | null = null;
  if (rows.length === 0) {
    cpaUnavailableReason = "no_rows";
  } else if (scope.event === null) {
    cpaUnavailableReason = "event_not_defined";
  } else {
    const unmeasured = rows.find(
      (row) => row.conversion.status !== "measured" || row.conversion.value === null
    );
    if (unmeasured) {
      cpaUnavailableReason = unmeasuredReason(unmeasured.conversion.status);
    } else {
      conversions = rows.reduce((sum, row) => sum + (row.conversion.value ?? 0), 0);
      const lines: ConsolidationLine[] = [];
      let missingContext = false;
      for (const row of rows) {
        const context = rowContext(sources, scope, now, row.anuncio_id);
        if (!context || !row.conversion.actionType || row.conversion.value === null) {
          missingContext = true;
          break;
        }
        lines.push({
          actionType: row.conversion.actionType,
          value: row.conversion.value,
          spend: row.spend,
          context,
        });
      }
      if (missingContext) {
        cpaUnavailableReason = "missing_context";
      } else {
        const compatibility = assertCompatibleLines(lines.map((line) => line.context));
        if (!compatibility.ok) {
          cpaUnavailableReason = compatibility.reason;
        } else {
          cpa = consolidateCpa(lines);
          if (cpa === null) {
            const total = lines.reduce((sum, line) => sum + line.value, 0);
            const spendValid = lines.every((line) => Number.isFinite(line.spend) && line.spend >= 0);
            cpaUnavailableReason = !spendValid
              ? "invalid_spend"
              : total <= 0
                ? "no_positive_conversions"
                : "unavailable";
          }
        }
      }
    }
  }

  const event = scope.event === null
    ? { actionType: null, labelPtBR: null, labelEn: null, known: false }
    : (() => {
        const described = bilingualEvent(scope.event);
        return {
          actionType: described.actionType,
          labelPtBR: described.labelPtBR,
          labelEn: described.labelEn,
          known: described.known,
        };
      })();

  return {
    meta: {
      event,
      availableEvents: listAvailableEvents(
        sources.map((s) => s.row.actionCounts),
        "pt-BR"
      ).map((option) => bilingualEvent(option.actionType)),
      windowDays: scope.windowDays,
      format: scope.format ?? "all",
      definitionVersion: CONVERSION_DEFINITION_VERSION,
      mode: scope.mode,
      collectionComplete,
      generatedAt: now.toISOString(),
    },
    summary: {
      rows: rows.length,
      impressions: rows.reduce((sum, row) => sum + row.impressions, 0),
      clicks: rows.reduce((sum, row) => sum + row.clicks, 0),
      spend: rows.reduce((sum, row) => sum + row.spend, 0),
      currencies,
      conversions,
      cpa,
      cpaUnavailableReason,
      ctrDefinition: "clicks_divided_by_impressions",
      collectionComplete,
    },
    rows,
  };
}

function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Exportação CSV do MESMO relatório da tela: mesmos evento, período e
 * versão, a partir do mesmo builder. Nulos saem vazios, nunca zero.
 */
export function reportToCsv(report: ServedAdsReport, generatedAt: Date = new Date()): string {
  const lines = [
    "# served_ads_report",
    `# definition_version,${report.meta.definitionVersion}`,
    `# mode,${report.meta.mode}`,
    `# window_days,${report.meta.windowDays}`,
    `# format,${report.meta.format}`,
    `# event,${report.meta.event.actionType ?? ""}`,
    `# event_label_pt-BR,${report.meta.event.labelPtBR ?? ""}`,
    `# event_label_en,${report.meta.event.labelEn ?? ""}`,
    `# collection_complete,${report.meta.collectionComplete}`,
    `# generated_at,${generatedAt.toISOString()}`,
    "anuncio_id,ad_account_id,creative_id,format,text,impressions,clicks,spend,conversions,ctr,cpc,cpa,conversion_status,conversion_action_type",
    ...report.rows.map((row) =>
      [
        row.anuncio_id,
        row.ad_account_id,
        row.creative_id,
        row.format,
        row.text,
        row.impressions,
        row.clicks,
        row.spend,
        row.conversions,
        row.ctr,
        row.cpc,
        row.cpa,
        row.conversion.status,
        row.conversion.actionType,
      ]
        .map((cell) => csvCell(cell))
        .join(",")
    ),
    `# summary_rows,${report.summary.rows}`,
    `# summary_impressions,${report.summary.impressions}`,
    `# summary_clicks,${report.summary.clicks}`,
    `# summary_spend,${report.summary.spend}`,
    `# summary_conversions,${report.summary.conversions ?? ""}`,
    `# summary_cpa,${report.summary.cpa ?? ""}`,
    `# summary_cpa_unavailable,${report.summary.cpaUnavailableReason ?? ""}`,
  ];
  return lines.join("\n");
}

export const SERVED_ADS_REPORT_CACHE_TAG = "served-ads-report";
export const SERVED_ADS_REPORT_CACHE_SECONDS = 60;

export interface ReportCacheScope {
  workspaceId: string;
  brandId: string;
  windowDays: 7 | 30 | 90;
  format?: ServedAdFormat;
  event: string | null;
}

/**
 * Chave do cache: mesmo evento, período, formato, marca, workspace e
 * versão da tela. Escopos distintos nunca partilham entrada.
 */
export function reportCacheKeyParts(scope: ReportCacheScope): string[] {
  return [
    "served-ads-report",
    `v${CONVERSION_DEFINITION_VERSION}`,
    scope.workspaceId,
    scope.brandId,
    String(scope.windowDays),
    scope.format ?? "all",
    scope.event ?? "no-event",
  ];
}

export interface ReportSourceScope extends ReportCacheScope {
  now?: Date;
}

export interface ReportSource {
  mode: ReportMode;
  sources: ReportSourceRow[];
}

async function loadReportSourceUncached(scope: ReportSourceScope): Promise<ReportSource> {
  const connected = await hasMetaConnection(scope.workspaceId);
  if (!connected) {
    const rows = getFixtureAdRows(scope.windowDays).filter(
      (row) => !scope.format || row.format === scope.format
    );
    return {
      mode: "fixture",
      sources: rows.map((row) => ({ row, context: null, currency: "BRL" })),
    };
  }
  const dbRows = await listServedAdRows(scope.workspaceId, scope.brandId, scope.windowDays, scope.format);
  return {
    mode: "live",
    sources: dbRows.map((dbRow) => ({
      row: {
        ad_account_id: dbRow.ad_account_id,
        ad_id: dbRow.ad_id,
        creative_id: dbRow.creative_id,
        format: dbRow.format,
        text: dbRow.text,
        impressions: dbRow.impressions,
        clicks: dbRow.clicks,
        spend: dbRow.spend,
        conversions: dbRow.conversions,
        actionCounts: dbRow.actionCounts,
        ambiguousActionTypes: dbRow.ambiguousActionTypes,
        complete: dbRow.complete,
      },
      context: dbRow.snapshot,
      currency: dbRow.currency,
      media: { imageKey: dbRow.imageKey, thumbKey: dbRow.thumbKey },
    })),
  };
}

/**
 * Fonte única do relatório para tela e exportações: mesma consulta, mesma
 * chave de cache. Tela, CSV e cache partilham evento, período e versão.
 */
export async function loadReportSource(scope: ReportSourceScope): Promise<ReportSource> {
  const load = unstable_cache(() => loadReportSourceUncached(scope), reportCacheKeyParts(scope), {
    revalidate: SERVED_ADS_REPORT_CACHE_SECONDS,
    tags: [SERVED_ADS_REPORT_CACHE_TAG],
  });
  return load();
}

const servedAdsQuerySchema = z.object({
  brandId: z.string().uuid(),
  window: z.enum(["7", "30", "90"]).default("30"),
  format: z.enum(["imagem", "video", "carrossel"]).optional(),
  event: z.string().max(128).optional(),
  export: z.enum(["csv"]).optional(),
});

export interface ServedAdsQuery {
  brandId: string;
  windowDays: 7 | 30 | 90;
  format?: ServedAdFormat;
  /** Evento normalizado; null = não escolhido. */
  event: string | null;
  /** Negociação de conteúdo na mesma rota (freeze: sem rota aninhada). */
  exportFormat?: "csv";
}

export type ServedAdsQueryParse =
  | { ok: true; query: ServedAdsQuery }
  | { ok: false; issues: unknown };

/**
 * Contrato único de query da tela e das exportações: mesmos parâmetros,
 * mesma validação. `event` vazio = não escolhido; fora do alfabeto de
 * tipos de ação, rejeitado — nunca adivinhado.
 */
export function parseServedAdsQuery(searchParams: URLSearchParams): ServedAdsQueryParse {
  const parsed = servedAdsQuerySchema.safeParse({
    brandId: searchParams.get("brandId"),
    window: searchParams.get("window") ?? undefined,
    format: searchParams.get("format") ?? undefined,
    event: searchParams.get("event") ?? undefined,
    export: searchParams.get("export") ?? undefined,
  });
  if (!parsed.success) return { ok: false, issues: parsed.error.flatten() };
  const event = normalizeEventParam(parsed.data.event);
  if (event !== null && !/^[\w.:-]{1,128}$/.test(event)) {
    return { ok: false, issues: { event: ["invalidEvent"] } };
  }
  return {
    ok: true,
    query: {
      brandId: parsed.data.brandId,
      windowDays: Number(parsed.data.window) as 7 | 30 | 90,
      format: parsed.data.format as ServedAdFormat | undefined,
      event,
      ...(parsed.data.export ? { exportFormat: parsed.data.export } : {}),
    },
  };
}
