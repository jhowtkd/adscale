// Mídia e mensuração IA: shadow-mode reader over served ads (#550).
//
// Interface + a reader over the existing Anúncios veiculados data. Read
// only: recommendations are labeled shadow and have no effect — no spend,
// budget, or ad changes. GA4 is out of scope: no GA4 reader exists in the
// repo today, so the snapshot lists served_ads as its only source.

import {
  listServedAdRows,
  type ServedAdDbRow,
} from "@/server/served-ads/repository";

export type MeasurementReadInput = {
  workspaceId: string;
  /** Client profile (brand) whose linked ad accounts are read. */
  brandId: string;
  windowDays?: number;
};

export type MeasurementSnapshot = {
  mode: "shadow";
  sources: ["served_ads"];
  windowDays: number;
  totals: { impressions: number; clicks: number; spend: number; conversions: number };
  topAds: Array<{
    creativeId: string;
    format: string;
    spend: number;
    conversions: number;
  }>;
  /** Shadow-only: what the agent WOULD recommend. No effect. */
  recommendations: string[];
};

export interface MeasurementReader {
  read(input: MeasurementReadInput): Promise<MeasurementSnapshot>;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(parsed) ? parsed : 0;
}

function summarize(rows: ServedAdDbRow[], windowDays: number): MeasurementSnapshot {
  const totals = { impressions: 0, clicks: 0, spend: 0, conversions: 0 };
  for (const row of rows) {
    totals.impressions += toNumber(row.impressions);
    totals.clicks += toNumber(row.clicks);
    totals.spend += toNumber(row.spend);
    totals.conversions += toNumber(row.conversions);
  }
  const topAds = [...rows]
    .sort((a, b) => toNumber(b.spend) - toNumber(a.spend))
    .slice(0, 5)
    .map((row) => ({
      creativeId: row.creative_id ?? `${row.ad_account_id}:${row.ad_id}`,
      format: row.format,
      spend: toNumber(row.spend),
      conversions: toNumber(row.conversions),
    }));
  return {
    mode: "shadow",
    sources: ["served_ads"],
    windowDays,
    totals,
    topAds,
    recommendations: [
      "[shadow] Weekly read complete — recommendations below would need a human-approved mandate to act.",
    ],
  };
}

export class ServedAdsMeasurementReader implements MeasurementReader {
  constructor(
    private readonly listRows: typeof listServedAdRows = listServedAdRows,
  ) {}

  async read(input: MeasurementReadInput): Promise<MeasurementSnapshot> {
    const windowDays = input.windowDays ?? 7;
    const rows = await this.listRows(input.workspaceId, input.brandId, windowDays);
    return summarize(rows, windowDays);
  }
}
