/**
 * Agregação de Anúncios veiculados (#346 rev. 2). Pura e testada:
 * a ingestão (PR de rotas) e o fixture (PR de snapshot) falam esta língua.
 *
 * ICE-01A: a soma antiga de `conversions` não é mais conversão validada.
 * Cada grupo mede um tipo de ação explícito a partir do mapa normalizado;
 * sem mapa, a linha é legado não verificado, com CPA indisponível.
 */
import {
  deriveCpa,
  legacyMeasure,
  measureConversion,
  type ConversionMeasure,
} from "./conversion";

export type ServedAdFormat = "imagem" | "video" | "carrossel";

/** Piso de evidência: abaixo disso, fora da briga por CTR. */
export const EVIDENCE_FLOOR_IMPRESSIONS = 1000;

/** Linha de ad da Meta antes de agregar (um ad = um creative). */
export interface MetaAdRow {
  ad_account_id: string;
  ad_id: string;
  creative_id: string | null;
  format: ServedAdFormat;
  text: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  /** Soma legada: exibida só com sinalização de não validada. */
  conversions: number;
  /** Mapa normalizado de contagens por tipo de ação (v2); ausente = legado. */
  actionCounts?: Record<string, number> | null;
  /** Tipos com valores conflitantes na coleta. */
  ambiguousActionTypes?: string[];
  /** Falso = leitura parcial da coleta, nunca número final. */
  complete?: boolean;
}

export interface ServedAdReportRow {
  anuncio_id: string;
  ad_account_id: string;
  creative_id: string;
  format: ServedAdFormat;
  text: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  /**
   * Conversões para exibição: valor medido (v2) ou soma legada sinalizada.
   * Null = não medido; nunca confundir com zero.
   */
  conversions: number | null;
  /** % cliques/impressões. Null sem impressões. */
  ctr: number | null;
  cpc: number | null;
  /** Só com medida validada; sem definição, indisponível — nunca zero. */
  cpa: number | null;
  sem_evidencia: boolean;
  /**
   * Soma bruta das entradas do grupo, só para persistência sinalizada de
   * legado. Nunca é conversão validada — a rota decide pela `conversion`.
   */
  legacyConversions: number;
  /** Medição versionada do grupo para o evento explícito. */
  conversion: ConversionMeasure;
  /** Mapa fundido do grupo (soma só do mesmo tipo); null no legado. */
  actionCounts: Record<string, number> | null;
  ambiguousActionTypes: string[];
}

export function buildAnuncioId(adAccountId: string, creativeId: string): string {
  return `${adAccountId}:${creativeId}`;
}

function derive(impressions: number, clicks: number, spend: number) {
  return {
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    cpc: clicks > 0 ? spend / clicks : null,
  };
}

interface GroupAccumulator {
  row: ServedAdReportRow;
  legacySum: number;
  /** V2 quando ao menos um ad do grupo trouxe mapa. */
  hasMap: boolean;
  merged: Record<string, number>;
  ambiguous: Set<string>;
  complete: boolean;
}

function measureGroup(acc: GroupAccumulator, actionType: string | null): void {
  if (!acc.hasMap) {
    acc.row.conversion = legacyMeasure();
    acc.row.conversions = acc.legacySum;
    acc.row.cpa = null;
    acc.row.actionCounts = null;
    acc.row.ambiguousActionTypes = [...acc.ambiguous].sort();
    return;
  }
  const actionCounts: Record<string, number> = {};
  for (const [type, value] of Object.entries(acc.merged)) {
    if (!acc.ambiguous.has(type)) actionCounts[type] = value;
  }
  const conversion = measureConversion({
    actionType,
    actions: Object.entries(actionCounts).map(([type, value]) => ({ actionType: type, value })),
    complete: acc.complete,
    ambiguousTypes: [...acc.ambiguous],
  });
  acc.row.conversion = conversion;
  acc.row.conversions = conversion.value;
  acc.row.cpa = deriveCpa(conversion, acc.row.spend);
  acc.row.actionCounts = actionCounts;
  acc.row.ambiguousActionTypes = [...acc.ambiguous].sort();
}

/**
 * Agrupa ads por `ad_account_id:creative_id`, somando métricas.
 * - Ads com o mesmo creative_id somam; creative_id distintos nunca fundem.
 * - Carrossel e dinâmico têm um creative_id → uma linha, sem explodir.
 * - Ad sem creative.id não entra.
 * - Conversão: mede `actionType` explícito sobre o mapa fundido do grupo
 *   (soma só do mesmo tipo); sem mapa, legado não verificado sem CPA.
 */
export function aggregateAdRows(rows: MetaAdRow[], options: { actionType?: string | null } = {}): ServedAdReportRow[] {
  const actionType = options.actionType ?? null;
  const grouped = new Map<string, GroupAccumulator>();
  for (const row of rows) {
    if (!row.creative_id) continue;
    const anuncio_id = buildAnuncioId(row.ad_account_id, row.creative_id);
    let acc = grouped.get(anuncio_id);
    if (!acc) {
      const reportRow: ServedAdReportRow = {
        anuncio_id,
        ad_account_id: row.ad_account_id,
        creative_id: row.creative_id,
        format: row.format,
        text: row.text,
        impressions: 0,
        clicks: 0,
        spend: 0,
        conversions: null,
        ...derive(0, 0, 0),
        cpa: null,
        sem_evidencia: false,
        legacyConversions: 0,
        conversion: legacyMeasure(),
        actionCounts: null,
        ambiguousActionTypes: [],
      };
      acc = { row: reportRow, legacySum: 0, hasMap: false, merged: {}, ambiguous: new Set(), complete: true };
      grouped.set(anuncio_id, acc);
    }
    acc.row.impressions += row.impressions;
    acc.row.clicks += row.clicks;
    acc.row.spend += row.spend;
    acc.legacySum += row.conversions;
    if (!acc.row.text && row.text) acc.row.text = row.text;
    if (row.actionCounts) {
      acc.hasMap = true;
      for (const [type, value] of Object.entries(row.actionCounts)) {
        acc.merged[type] = (acc.merged[type] ?? 0) + value;
      }
    }
    for (const type of row.ambiguousActionTypes ?? []) acc.ambiguous.add(type);
    if (row.complete === false) acc.complete = false;
  }
  for (const acc of grouped.values()) {
    Object.assign(acc.row, derive(acc.row.impressions, acc.row.clicks, acc.row.spend));
    acc.row.legacyConversions = acc.legacySum;
    measureGroup(acc, actionType);
  }
  return [...grouped.values()].map((acc) => acc.row);
}

/**
 * Sort do relatório: CTR desc só entre quem tem ≥ 1.000 impressões;
 * abaixo disso, a linha permanece listada depois, marcada sem evidência.
 */
export function sortReportRows(rows: ServedAdReportRow[]): ServedAdReportRow[] {
  for (const row of rows) {
    row.sem_evidencia = row.impressions < EVIDENCE_FLOOR_IMPRESSIONS || row.ctr === null;
  }
  return [...rows].sort((a, b) => {
    if (a.sem_evidencia !== b.sem_evidencia) return a.sem_evidencia ? 1 : -1;
    if (!a.sem_evidencia) return (b.ctr ?? 0) - (a.ctr ?? 0);
    return b.impressions - a.impressions;
  });
}
