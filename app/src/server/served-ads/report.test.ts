import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildServedAdsReport,
  fixtureComparability,
  loadReportSource,
  reportCacheKeyParts,
  reportToCsv,
  SERVED_ADS_REPORT_CACHE_TAG,
  type ReportSourceRow,
} from "./report";
import type { ComparabilityContext } from "./conversion";
import type { MetaAdRow as AggMetaAdRow } from "./aggregate";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
}));

const mocks = vi.hoisted(() => ({ hasConnection: vi.fn(), listRows: vi.fn() }));
vi.mock("./repository", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    hasMetaConnection: (...args: unknown[]) => mocks.hasConnection(...args),
    listServedAdRows: (...args: unknown[]) => mocks.listRows(...args),
  };
});

function context(overrides: Partial<ComparabilityContext> = {}): ComparabilityContext {
  return {
    definitionVersion: 2,
    currency: "BRL",
    periodStart: "2026-08-18T12:00:00.000Z",
    periodEnd: "2026-09-17T12:00:00.000Z",
    windowDays: 30,
    attribution: { status: "unknown", condition: "meta_attribution_not_requested" },
    completeness: "complete",
    origin: "real",
    ...overrides,
  };
}

function sourceRow(
  creativeId: string,
  overrides: Partial<AggMetaAdRow> = {},
  rowContext: ComparabilityContext | null = context()
): ReportSourceRow {
  const row: AggMetaAdRow = {
    ad_account_id: "act1",
    ad_id: `ad-${creativeId}`,
    creative_id: creativeId,
    format: "imagem",
    text: `Copy ${creativeId}`,
    impressions: 5000,
    clicks: 150,
    spend: 750,
    conversions: 12,
    actionCounts: { purchase: 12 },
    ambiguousActionTypes: [],
    complete: true,
    ...overrides,
  };
  return { row, context: rowContext, currency: rowContext?.currency ?? "BRL" };
}

const NOW = new Date("2026-09-17T12:00:00.000Z");

describe("buildServedAdsReport (ICE-01B)", () => {
  it("eco de escopo: evento descrito nos dois locales + eventos disponíveis + versão", () => {
    const report = buildServedAdsReport({
      scope: {
        brandId: "brand-1",
        workspaceId: "ws-1",
        windowDays: 30,
        event: "purchase",
        mode: "live",
      },
      sources: [sourceRow("c1", { actionCounts: { purchase: 12, lead: 3 } })],
      now: NOW,
    });
    expect(report.meta.event).toEqual({
      actionType: "purchase",
      labelPtBR: "Compra",
      labelEn: "Purchase",
      known: true,
    });
    expect(report.meta.availableEvents.map((e) => e.actionType)).toEqual(["lead", "purchase"]);
    expect(report.meta.windowDays).toBe(30);
    expect(report.meta.definitionVersion).toBe(2);
    expect(report.meta.mode).toBe("live");
  });

  it("sem evento escolhido: linhas não definidas, CPA indisponível — nunca zero", () => {
    const report = buildServedAdsReport({
      scope: { brandId: "b", workspaceId: "w", windowDays: 30, event: null, mode: "live" },
      sources: [sourceRow("c1")],
      now: NOW,
    });
    expect(report.rows[0].conversion.status).toBe("not_defined");
    expect(report.rows[0].cpa).toBeNull();
    expect(report.summary.conversions).toBeNull();
    expect(report.summary.cpa).toBeNull();
    expect(report.summary.cpaUnavailableReason).toBe("event_not_defined");
    expect(report.meta.event).toEqual({
      actionType: null,
      labelPtBR: null,
      labelEn: null,
      known: false,
    });
  });

  it("evento escolhido + linhas compatíveis: total e CPA consolidado do evento", () => {
    const report = buildServedAdsReport({
      scope: { brandId: "b", workspaceId: "w", windowDays: 30, event: "purchase", mode: "live" },
      sources: [
        sourceRow("c1", { spend: 750, actionCounts: { purchase: 12 } }),
        sourceRow("c2", { spend: 250, actionCounts: { purchase: 8 } }),
      ],
      now: NOW,
    });
    expect(report.rows.map((r) => r.conversion.status)).toEqual(["measured", "measured"]);
    expect(report.summary.conversions).toBe(20);
    expect(report.summary.cpa).toBeCloseTo(1000 / 20, 10);
    expect(report.summary.cpaUnavailableReason).toBeNull();
    expect(report.summary.collectionComplete).toBe(true);
    expect(report.summary.ctrDefinition).toBe("clicks_divided_by_impressions");
  });

  it("coleta parcial: linha incompleta sinalizada, consolidado indisponível", () => {
    const report = buildServedAdsReport({
      scope: { brandId: "b", workspaceId: "w", windowDays: 30, event: "purchase", mode: "live" },
      sources: [
        sourceRow("c1"),
        sourceRow("c2", { complete: false }, context({ completeness: "partial" })),
      ],
      now: NOW,
    });
    expect(report.rows.find((r) => r.creative_id === "c2")?.conversion.status).toBe("incomplete");
    expect(report.summary.conversions).toBeNull();
    expect(report.summary.cpa).toBeNull();
    expect(report.summary.cpaUnavailableReason).toBe("incomplete_lines");
    expect(report.summary.collectionComplete).toBe(false);
  });

  it("moedas distintas não se misturam na razão agregada", () => {
    const report = buildServedAdsReport({
      scope: { brandId: "b", workspaceId: "w", windowDays: 30, event: "purchase", mode: "live" },
      sources: [
        sourceRow("c1", { ad_account_id: "act1" }, context({ currency: "BRL" })),
        sourceRow("c2", { ad_account_id: "act2" }, context({ currency: "USD" })),
      ],
      now: NOW,
    });
    expect(report.rows.every((r) => r.conversion.status === "measured")).toBe(true);
    expect(report.summary.conversions).toBe(24);
    expect(report.summary.cpa).toBeNull();
    expect(report.summary.cpaUnavailableReason).toBe("currency_mismatch");
    expect(report.summary.currencies).toEqual(["BRL", "USD"]);
  });

  it("períodos distintos não se misturam na razão agregada", () => {
    const report = buildServedAdsReport({
      scope: { brandId: "b", workspaceId: "w", windowDays: 30, event: "purchase", mode: "live" },
      sources: [
        sourceRow("c1", {}, context({ periodStart: "2026-08-18T12:00:00.000Z" })),
        sourceRow("c2", {}, context({ periodStart: "2026-08-19T12:00:00.000Z" })),
      ],
      now: NOW,
    });
    expect(report.summary.cpa).toBeNull();
    expect(report.summary.cpaUnavailableReason).toBe("period_mismatch");
  });

  it("linhas legadas aparecem como não validadas e vetam o consolidado", () => {
    const report = buildServedAdsReport({
      scope: { brandId: "b", workspaceId: "w", windowDays: 30, event: "purchase", mode: "live" },
      sources: [
        sourceRow("c1"),
        sourceRow("c2", { actionCounts: null, conversions: 130 }, null),
      ],
      now: NOW,
    });
    const legacy = report.rows.find((r) => r.creative_id === "c2");
    expect(legacy?.conversion.status).toBe("legacy_unverified");
    expect(legacy?.conversions).toBe(130);
    expect(legacy?.cpa).toBeNull();
    expect(report.summary.cpa).toBeNull();
    expect(report.summary.cpaUnavailableReason).toBe("legacy_lines");
  });

  it("modo fixture sintetiza contexto compatível para todas as linhas", () => {
    const report = buildServedAdsReport({
      scope: { brandId: "b", workspaceId: "w", windowDays: 7, event: "lead", mode: "fixture" },
      sources: [
        { row: { ...sourceRow("c1").row, actionCounts: { lead: 5 } }, context: null, currency: "BRL" },
        { row: { ...sourceRow("c2").row, actionCounts: { lead: 7 } }, context: null, currency: "BRL" },
      ],
      now: NOW,
    });
    expect(report.summary.conversions).toBe(12);
    expect(report.summary.cpa).toBeCloseTo(1500 / 12, 10);
    expect(report.summary.cpaUnavailableReason).toBeNull();
  });

  it("fixtureComparability: janela absoluta a partir de now, origem mock", () => {
    const ctx = fixtureComparability(7, NOW);
    expect(ctx).toMatchObject({
      definitionVersion: 2,
      currency: "BRL",
      windowDays: 7,
      origin: "mock",
      completeness: "complete",
      periodEnd: "2026-09-17T12:00:00.000Z",
      periodStart: "2026-09-10T12:00:00.000Z",
    });
  });

  it("meta expõe período absoluto, atribuição e origem quando unânimes", () => {
    const report = buildServedAdsReport({
      scope: { brandId: "b", workspaceId: "w", windowDays: 30, event: "purchase", mode: "live" },
      sources: [sourceRow("c1"), sourceRow("c2")],
      now: NOW,
    });
    expect(report.meta.periodStart).toBe("2026-08-18T12:00:00.000Z");
    expect(report.meta.periodEnd).toBe("2026-09-17T12:00:00.000Z");
    expect(report.meta.attribution).toEqual({
      status: "unknown",
      condition: "meta_attribution_not_requested",
    });
    expect(report.meta.origins).toEqual(["real"]);
    expect(report.meta.contextsDivergent).toBe(false);
  });

  it("contextos divergentes: nulos + sinal explícito em vez de período/atribuição", () => {
    const report = buildServedAdsReport({
      scope: { brandId: "b", workspaceId: "w", windowDays: 30, event: "purchase", mode: "live" },
      sources: [
        sourceRow("c1", {}, context({ periodStart: "2026-08-18T12:00:00.000Z" })),
        sourceRow("c2", {}, context({ periodStart: "2026-08-19T12:00:00.000Z" })),
      ],
      now: NOW,
    });
    expect(report.meta.periodStart).toBeNull();
    expect(report.meta.periodEnd).toBeNull();
    expect(report.meta.attribution).toBeNull();
    expect(report.meta.contextsDivergent).toBe(true);
  });

  it("contexto ausente numa linha veta o resumo unânime e sinaliza divergência", () => {
    const report = buildServedAdsReport({
      scope: { brandId: "b", workspaceId: "w", windowDays: 30, event: "purchase", mode: "live" },
      sources: [sourceRow("c1"), sourceRow("c2", {}, null)],
      now: NOW,
    });
    expect(report.meta.periodStart).toBeNull();
    expect(report.meta.attribution).toBeNull();
    expect(report.meta.origins).toEqual(["real"]);
    expect(report.meta.contextsDivergent).toBe(true);
  });

  it("modo fixture sintetiza período, atribuição e origem mock unânimes", () => {
    const report = buildServedAdsReport({
      scope: { brandId: "b", workspaceId: "w", windowDays: 7, event: "lead", mode: "fixture" },
      sources: [
        { row: { ...sourceRow("c1").row, actionCounts: { lead: 5 } }, context: null, currency: "BRL" },
        { row: { ...sourceRow("c2").row, actionCounts: { lead: 7 } }, context: null, currency: "BRL" },
      ],
      now: NOW,
    });
    expect(report.meta.periodStart).toBe("2026-09-10T12:00:00.000Z");
    expect(report.meta.periodEnd).toBe("2026-09-17T12:00:00.000Z");
    expect(report.meta.attribution).toEqual({
      status: "unknown",
      condition: "fixture_no_attribution",
    });
    expect(report.meta.origins).toEqual(["mock"]);
    expect(report.meta.contextsDivergent).toBe(false);
  });
});

describe("reportToCsv (ICE-01B)", () => {
  function csvReport() {
    return buildServedAdsReport({
      scope: { brandId: "b", workspaceId: "w", windowDays: 30, event: "purchase", mode: "fixture" },
      sources: [
        {
          row: {
            ...sourceRow("c1", { text: 'Oferta "imperdível", hoje' }).row,
            actionCounts: { purchase: 12 },
          },
          context: null,
          currency: "BRL",
        },
      ],
      now: NOW,
    });
  }

  it("cabeçalho comenta evento, período e versão da tela", () => {
    const csv = reportToCsv(csvReport());
    expect(csv).toContain("# window_days,30");
    expect(csv).toContain("# event,purchase");
    expect(csv).toContain("# definition_version,2");
    expect(csv).toContain("# mode,fixture");
    expect(csv).toContain("anuncio_id,");
  });

  it("cabeçalho comenta período absoluto, atribuição e origem idênticos à tela", () => {
    const csv = reportToCsv(csvReport());
    expect(csv).toContain("# period_start,2026-08-18T12:00:00.000Z");
    expect(csv).toContain("# period_end,2026-09-17T12:00:00.000Z");
    expect(csv).toContain("# attribution,unknown:fixture_no_attribution");
    expect(csv).toContain("# origins,mock");
    expect(csv).toContain("# contexts_divergent,false");
  });

  it("contextos divergentes saem vazios no CSV com a divergência sinalizada", () => {
    const csv = reportToCsv(
      buildServedAdsReport({
        scope: { brandId: "b", workspaceId: "w", windowDays: 30, event: "purchase", mode: "live" },
        sources: [
          sourceRow("c1", {}, context({ periodStart: "2026-08-18T12:00:00.000Z" })),
          sourceRow("c2", {}, context({ periodStart: "2026-08-19T12:00:00.000Z" })),
        ],
        now: NOW,
      })
    );
    expect(csv).toContain("# period_start,");
    expect(csv).toContain("# period_end,");
    expect(csv).toContain("# attribution,");
    expect(csv).toContain("# contexts_divergent,true");
  });

  it("escapa texto com vírgula/aspas e nulos saem vazios", () => {
    const csv = reportToCsv(csvReport());
    expect(csv).toContain('"Oferta ""imperdível"", hoje"');
    const nullCsv = reportToCsv(
      buildServedAdsReport({
        scope: { brandId: "b", workspaceId: "w", windowDays: 30, event: null, mode: "live" },
        sources: [sourceRow("c1")],
        now: NOW,
      })
    );
    const dataLine = nullCsv.split("\n").find((line) => line.startsWith("act1:c1,"));
    // conversions, cpa vazios — nunca zero presumido.
    expect(dataLine).toMatch(/,,.*,,/);
    expect(dataLine).not.toMatch(/,0,/);
  });
});

describe("report cache key (ICE-01B)", () => {
  it("chave inclui evento, período, formato, marca, workspace e versão", () => {
    const parts = reportCacheKeyParts({
      workspaceId: "ws-1",
      brandId: "brand-1",
      windowDays: 30,
      format: "video",
      event: "purchase",
    });
    expect(parts.join("|")).toContain("ws-1");
    expect(parts.join("|")).toContain("brand-1");
    expect(parts.join("|")).toContain("30");
    expect(parts.join("|")).toContain("video");
    expect(parts.join("|")).toContain("purchase");
    expect(parts.join("|")).toContain("v2");
    expect(SERVED_ADS_REPORT_CACHE_TAG).toBe("served-ads-report");
  });

  it("evento distinto gera chave distinta (sem vazamento entre escopos)", () => {
    const base = { workspaceId: "w", brandId: "b", windowDays: 30 as const };
    expect(reportCacheKeyParts({ ...base, event: "purchase" })).not.toEqual(
      reportCacheKeyParts({ ...base, event: "lead" })
    );
    expect(reportCacheKeyParts({ ...base, event: null })).not.toEqual(
      reportCacheKeyParts({ ...base, event: "purchase" })
    );
  });
});

describe("loadReportSource (ICE-01B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sem Conexão: fixture, contexto nulo, moeda BRL", async () => {
    mocks.hasConnection.mockResolvedValue(false);
    const source = await loadReportSource({
      workspaceId: "ws-1",
      brandId: "brand-1",
      windowDays: 30,
      event: null,
    });
    expect(source.mode).toBe("fixture");
    expect(source.sources.length).toBeGreaterThan(0);
    expect(source.sources.every((s) => s.context === null)).toBe(true);
    expect(source.sources.every((s) => s.currency === "BRL")).toBe(true);
    expect(mocks.listRows).not.toHaveBeenCalled();
  });

  it("com Conexão: live, repassa contexto do snapshot e filtro de formato", async () => {
    mocks.hasConnection.mockResolvedValue(true);
    const snapshot = context();
    mocks.listRows.mockResolvedValue([
      {
        ad_account_id: "1",
        ad_id: "1:x",
        creative_id: "x",
        format: "imagem",
        text: "t",
        impressions: 2000,
        clicks: 40,
        spend: 100,
        conversions: 14,
        currency: "BRL",
        actionCounts: { purchase: 4 },
        ambiguousActionTypes: [],
        complete: true,
        snapshot,
      },
    ]);
    const source = await loadReportSource({
      workspaceId: "ws-1",
      brandId: "brand-1",
      windowDays: 7,
      format: "imagem",
      event: "purchase",
    });
    expect(source.mode).toBe("live");
    expect(mocks.listRows).toHaveBeenCalledWith("ws-1", "brand-1", 7, "imagem");
    expect(source.sources[0].context).toEqual(snapshot);
    expect(source.sources[0].currency).toBe("BRL");
  });
});
