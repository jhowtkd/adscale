import { describe, it, expect } from "vitest";
import {
  aggregateAdRows,
  buildAnuncioId,
  sortReportRows,
  type MetaAdRow,
} from "./aggregate";

function row(partial: Partial<MetaAdRow> & { ad_id: string }): MetaAdRow {
  return {
    ad_account_id: "111",
    creative_id: "c1",
    format: "imagem",
    text: "Texto",
    impressions: 1000,
    clicks: 10,
    spend: 100,
    conversions: 0,
    ...partial,
  };
}

describe("buildAnuncioId", () => {
  it("chave de aceite ad_account_id:creative_id", () => {
    expect(buildAnuncioId("111", "c1")).toBe("111:c1");
  });
});

describe("aggregateAdRows (aceites 1–4)", () => {
  it("1. dois ads com o mesmo creative_id na mesma conta somam", () => {
    const rows = aggregateAdRows([
      row({ ad_id: "a1", impressions: 2000, clicks: 40, spend: 200 }),
      row({ ad_id: "a2", impressions: 3000, clicks: 30, spend: 300 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      anuncio_id: "111:c1",
      impressions: 5000,
      clicks: 70,
      spend: 500,
    });
    expect(rows[0].ctr).toBeCloseTo(1.4, 10);
    expect(rows[0].cpc).toBeCloseTo(500 / 70, 10);
  });

  it("2. mesmo creative_id em contas diferentes = linhas distintas", () => {
    const rows = aggregateAdRows([
      row({ ad_id: "a1", ad_account_id: "111" }),
      row({ ad_id: "a2", ad_account_id: "222" }),
    ]);
    expect(rows.map((r) => r.anuncio_id).sort()).toEqual(["111:c1", "222:c1"]);
  });

  it("3. mesma mídia com copy diferente (creative_id distintos) nunca funde", () => {
    const rows = aggregateAdRows([
      row({ ad_id: "a1", creative_id: "c1", text: "Copy A" }),
      row({ ad_id: "a2", creative_id: "c2", text: "Copy B" }),
    ]);
    expect(rows).toHaveLength(2);
  });

  it("4a. carrossel = uma linha (cards não explodem)", () => {
    const rows = aggregateAdRows([
      row({ ad_id: "a1", creative_id: "car1", format: "carrossel" }),
      row({ ad_id: "a2", creative_id: "car1", format: "carrossel" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].format).toBe("carrossel");
  });

  it("4b. dinâmico = uma linha (combinações não explodem)", () => {
    const rows = aggregateAdRows([
      row({ ad_id: "a1", creative_id: "dyn1", format: "video" }),
      row({ ad_id: "a2", creative_id: "dyn1", format: "video" }),
    ]);
    expect(rows).toHaveLength(1);
  });

  it("4c. ad sem creative.id não entra", () => {
    const rows = aggregateAdRows([
      row({ ad_id: "a1", creative_id: null }),
      row({ ad_id: "a2", creative_id: "c1" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].anuncio_id).toBe("111:c1");
  });

  it("derivados com zero são null, sem NaN", () => {
    const rows = aggregateAdRows([row({ ad_id: "a1", impressions: 0, clicks: 0, spend: 0 })]);
    expect(rows[0]).toMatchObject({ ctr: null, cpc: null, cpa: null });
  });

  it("CPA só com conversão", () => {
    const rows = aggregateAdRows([
      row({ ad_id: "a1", spend: 100, conversions: 4 }),
    ]);
    expect(rows[0].cpa).toBe(25);
  });
});

describe("sortReportRows (aceite 5)", () => {
  it("CTR desc entre evidenciados; sem evidência depois, marcados", () => {
    const rows = sortReportRows(
      aggregateAdRows([
        row({ ad_id: "a1", creative_id: "mid", impressions: 2000, clicks: 20 }), // ctr 1.0
        row({ ad_id: "a2", creative_id: "top", impressions: 5000, clicks: 150 }), // ctr 3.0
        row({ ad_id: "a3", creative_id: "low", impressions: 500, clicks: 50 }), // ctr 10 mas sem evidência
        row({ ad_id: "a4", creative_id: "low2", impressions: 100, clicks: 1 }),
      ])
    );
    expect(rows.map((r) => r.creative_id)).toEqual(["top", "mid", "low", "low2"]);
    expect(rows.map((r) => r.sem_evidencia)).toEqual([false, false, true, true]);
  });

  it("piso é inclusivo em 1.000", () => {
    const rows = sortReportRows(aggregateAdRows([row({ ad_id: "a1", impressions: 1000, clicks: 5 })]));
    expect(rows[0].sem_evidencia).toBe(false);
  });
});
