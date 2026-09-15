/**
 * Agregação de Anúncios veiculados (#346 rev. 2). Pura e testada:
 * a ingestão (PR de rotas) e o fixture (PR de snapshot) falam esta língua.
 */

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
  conversions: number;
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
  conversions: number;
  /** % cliques/impressões. Null sem impressões. */
  ctr: number | null;
  cpc: number | null;
  cpa: number | null;
  sem_evidencia: boolean;
}

export function buildAnuncioId(adAccountId: string, creativeId: string): string {
  return `${adAccountId}:${creativeId}`;
}

function derive(impressions: number, clicks: number, spend: number, conversions: number) {
  return {
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    cpc: clicks > 0 ? spend / clicks : null,
    cpa: conversions > 0 ? spend / conversions : null,
  };
}

/**
 * Agrupa ads por `ad_account_id:creative_id`, somando métricas.
 * - Ads com o mesmo creative_id somam; creative_id distintos nunca fundem.
 * - Carrossel e dinâmico têm um creative_id → uma linha, sem explodir.
 * - Ad sem creative.id não entra.
 */
export function aggregateAdRows(rows: MetaAdRow[]): ServedAdReportRow[] {
  const grouped = new Map<string, ServedAdReportRow>();
  for (const row of rows) {
    if (!row.creative_id) continue;
    const anuncio_id = buildAnuncioId(row.ad_account_id, row.creative_id);
    const existing = grouped.get(anuncio_id);
    if (!existing) {
      grouped.set(anuncio_id, {
        anuncio_id,
        ad_account_id: row.ad_account_id,
        creative_id: row.creative_id,
        format: row.format,
        text: row.text,
        impressions: row.impressions,
        clicks: row.clicks,
        spend: row.spend,
        conversions: row.conversions,
        ...derive(row.impressions, row.clicks, row.spend, row.conversions),
        sem_evidencia: false,
      });
    } else {
      existing.impressions += row.impressions;
      existing.clicks += row.clicks;
      existing.spend += row.spend;
      existing.conversions += row.conversions;
      if (!existing.text && row.text) existing.text = row.text;
      Object.assign(
        existing,
        derive(existing.impressions, existing.clicks, existing.spend, existing.conversions)
      );
    }
  }
  return [...grouped.values()];
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
