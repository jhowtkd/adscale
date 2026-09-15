import type { MetaAdRow } from "./aggregate";

/**
 * Fixture da superfície sem Meta App (#348 pendente). Determinístico por
 * janela; cobre todos os casos do relatório: soma de spec repetida, copy
 * distinta, carrossel, vídeo, dinâmico, baixa evidência e ad sem creative.
 * Nunca chama a Meta. Some quando a primeira Conexão existir (ver rota).
 */

interface FixtureCreative {
  creative_id: string | null;
  format: "imagem" | "video" | "carrossel";
  text: string | null;
  /** Métricas base de 30 dias por ad; outras janelas escalam. */
  ads: Array<{ ad_id: string; impressions: number; clicks: number; spend: number; conversions: number }>;
}

const CREATIVES: FixtureCreative[] = [
  {
    creative_id: "1001",
    format: "imagem",
    text: "Matrículas abertas — 20% off nesta semana",
    ads: [
      { ad_id: "501", impressions: 42000, clicks: 1260, spend: 1890, conversions: 96 },
      { ad_id: "502", impressions: 18000, clicks: 450, spend: 810, conversions: 34 },
    ],
  },
  {
    creative_id: "1002",
    format: "imagem",
    text: "Matrículas abertas — garanta sua vaga",
    ads: [{ ad_id: "503", impressions: 25000, clicks: 500, spend: 1250, conversions: 22 }],
  },
  {
    creative_id: "2001",
    format: "video",
    text: "Veja como funciona em 30 segundos",
    ads: [{ ad_id: "504", impressions: 60000, clicks: 900, spend: 2400, conversions: 41 }],
  },
  {
    creative_id: "3001",
    format: "carrossel",
    text: "3 motivos para começar hoje",
    ads: [
      { ad_id: "505", impressions: 15000, clicks: 600, spend: 750, conversions: 18 },
      { ad_id: "506", impressions: 9000, clicks: 270, spend: 540, conversions: 9 },
    ],
  },
  {
    creative_id: "4001",
    format: "video",
    text: "Depoimento: de zero a fluente",
    ads: [{ ad_id: "507", impressions: 800, clicks: 40, spend: 60, conversions: 0 }],
  },
  {
    creative_id: null,
    format: "imagem",
    text: "Rascunho sem creative resolvido",
    ads: [{ ad_id: "508", impressions: 5000, clicks: 50, spend: 200, conversions: 0 }],
  },
];

const WINDOW_SCALE: Record<number, number> = { 7: 0.25, 30: 1, 90: 2.8 };

export function getFixtureAdRows(windowDays: 7 | 30 | 90): MetaAdRow[] {
  const scale = WINDOW_SCALE[windowDays] ?? 1;
  const rows: MetaAdRow[] = [];
  for (const creative of CREATIVES) {
    for (const ad of creative.ads) {
      rows.push({
        ad_account_id: "755001",
        ad_id: ad.ad_id,
        creative_id: creative.creative_id,
        format: creative.format,
        text: creative.text,
        impressions: Math.round(ad.impressions * scale),
        clicks: Math.round(ad.clicks * scale),
        spend: Math.round(ad.spend * scale * 100) / 100,
        conversions: Math.round(ad.conversions * scale),
      });
    }
  }
  return rows;
}
