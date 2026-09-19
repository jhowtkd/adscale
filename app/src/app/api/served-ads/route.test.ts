import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({ user: { id: "user-1" }, workspace: { id: "workspace-1" } })
  ),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: vi.fn(() =>
    Promise.resolve({ id: "brand-1", name: "Acme" })
  ),
}));

const mocks = vi.hoisted(() => ({ hasConnection: vi.fn(), listRows: vi.fn() }));
vi.mock("@/server/served-ads/repository", () => ({
  hasMetaConnection: (...args: unknown[]) => mocks.hasConnection(...args),
  listServedAdRows: (...args: unknown[]) => mocks.listRows(...args),
}));

const BRAND_ID = "123e4567-e89b-12d3-a456-426614174000";

function servedAdsRequest(params: string) {
  return new Request(`http://localhost/api/served-ads?${params}`);
}

describe("GET /api/served-ads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sem Conexão, roda com fixture ordenado por CTR (aceite 7)", async () => {
    mocks.hasConnection.mockResolvedValue(false);
    const res = await GET(servedAdsRequest(`brandId=${BRAND_ID}&window=30`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("fixture");
    expect(body.currencies).toEqual(["BRL"]);
    // 1001 (2 ads somados), 1002, 2001, 3001 (2 ads), 4001; null creative excluído.
    expect(body.rows).toHaveLength(5);
    const ctrs = body.rows.filter((row: { insufficientEvidence: boolean }) => !row.insufficientEvidence).map((row: { ctr: number }) => row.ctr);
    expect([...ctrs].sort((a, b) => b - a)).toEqual(ctrs);
    expect(body.rows.at(-1).insufficientEvidence).toBe(true);
    expect(mocks.listRows).not.toHaveBeenCalled();
  });

  it("recorte por formato filtra no fixture e no live", async () => {
    mocks.hasConnection.mockResolvedValue(false);
    const res = await GET(servedAdsRequest(`brandId=${BRAND_ID}&window=7&format=video`));
    const body = await res.json();
    expect(body.rows.length).toBeGreaterThan(0);
    expect(body.rows.every((row: { format: string }) => row.format === "video")).toBe(true);
  });

  it("com Conexão, lê do banco em modo live", async () => {
    mocks.hasConnection.mockResolvedValue(true);
    mocks.listRows.mockResolvedValue([
      {
        ad_account_id: "1", ad_id: "1:x", creative_id: "x", format: "imagem", text: "t",
        impressions: 2000, clicks: 40, spend: 100, conversions: 0, currency: "BRL",
      },
    ]);
    const res = await GET(servedAdsRequest(`brandId=${BRAND_ID}`));
    const body = await res.json();
    expect(body.mode).toBe("live");
    expect(mocks.listRows).toHaveBeenCalledWith("workspace-1", BRAND_ID, 30, undefined);
    expect(body.rows).toHaveLength(1);
    expect(body.hasConversions).toBe(false);
  });

  it("contenção: soma legada sem mapa sai sinalizada, sem CPA validado", async () => {
    mocks.hasConnection.mockResolvedValue(true);
    mocks.listRows.mockResolvedValue([
      {
        ad_account_id: "1", ad_id: "1:x", creative_id: "x", format: "imagem", text: "t",
        impressions: 2000, clicks: 40, spend: 100, conversions: 4, currency: "BRL",
      },
    ]);
    const res = await GET(servedAdsRequest(`brandId=${BRAND_ID}`));
    const body = await res.json();
    expect(body.rows[0]).toMatchObject({
      conversions: 4,
      cpa: null,
      conversion: { definitionVersion: 2, actionType: null, value: null, status: "legacy_unverified" },
    });
  });

  it("linha v2 sem evento escolhido não produz conversão nem CPA", async () => {
    mocks.hasConnection.mockResolvedValue(true);
    mocks.listRows.mockResolvedValue([
      {
        ad_account_id: "1", ad_id: "1:x", creative_id: "x", format: "imagem", text: "t",
        impressions: 2000, clicks: 40, spend: 100, conversions: 14, currency: "BRL",
        actionCounts: { purchase: 4, lead: 10 }, ambiguousActionTypes: [], complete: true,
      },
    ]);
    const res = await GET(servedAdsRequest(`brandId=${BRAND_ID}`));
    const body = await res.json();
    expect(body.rows[0]).toMatchObject({
      conversions: null,
      cpa: null,
      conversion: { status: "not_defined", value: null },
    });
    expect(body.hasConversions).toBe(false);
  });

  it("400 sem brandId ou com janela inválida", async () => {
    expect((await GET(servedAdsRequest("window=30"))).status).toBe(400);
    expect((await GET(servedAdsRequest(`brandId=${BRAND_ID}&window=60`))).status).toBe(400);
    expect(mocks.hasConnection).not.toHaveBeenCalled();
  });

  it("evento escolhido mede o tipo explícito e ecoa o escopo (ICE-01B)", async () => {
    mocks.hasConnection.mockResolvedValue(true);
    mocks.listRows.mockResolvedValue([
      {
        ad_account_id: "1", ad_id: "1:x", creative_id: "x", format: "imagem", text: "t",
        impressions: 2000, clicks: 40, spend: 100, conversions: 14, currency: "BRL",
        actionCounts: { purchase: 4, lead: 10 }, ambiguousActionTypes: [], complete: true,
        snapshot: {
          definitionVersion: 2, currency: "BRL",
          periodStart: "2026-08-18T12:00:00.000Z", periodEnd: "2026-09-17T12:00:00.000Z",
          windowDays: 30, attribution: { status: "unknown", condition: "c" },
          completeness: "complete", origin: "real",
        },
      },
    ]);
    const res = await GET(servedAdsRequest(`brandId=${BRAND_ID}&event=purchase`));
    const body = await res.json();
    expect(body.rows[0]).toMatchObject({
      conversions: 4,
      cpa: 25,
      conversion: { status: "measured", actionType: "purchase", value: 4 },
    });
    expect(body.event).toMatchObject({ actionType: "purchase", known: true });
    expect(body.availableEvents.map((e: { actionType: string }) => e.actionType)).toEqual([
      "lead",
      "purchase",
    ]);
    expect(body.summary).toMatchObject({
      conversions: 4,
      cpa: 25,
      cpaUnavailableReason: null,
    });
    expect(body.definitionVersion).toBe(2);
    expect(body.windowDays).toBe(30);
  });

  it("eco de comparabilidade: período, atribuição e origem no JSON (ICE-01)", async () => {
    mocks.hasConnection.mockResolvedValue(true);
    mocks.listRows.mockResolvedValue([
      {
        ad_account_id: "1", ad_id: "1:x", creative_id: "x", format: "imagem", text: "t",
        impressions: 2000, clicks: 40, spend: 100, conversions: 14, currency: "BRL",
        actionCounts: { purchase: 4 }, ambiguousActionTypes: [], complete: true,
        snapshot: {
          definitionVersion: 2, currency: "BRL",
          periodStart: "2026-08-18T12:00:00.000Z", periodEnd: "2026-09-17T12:00:00.000Z",
          windowDays: 30, attribution: { status: "known", spec: "7d_click" },
          completeness: "complete", origin: "real",
        },
      },
    ]);
    const res = await GET(servedAdsRequest(`brandId=${BRAND_ID}&event=purchase`));
    const body = await res.json();
    expect(body.periodStart).toBe("2026-08-18T12:00:00.000Z");
    expect(body.periodEnd).toBe("2026-09-17T12:00:00.000Z");
    expect(body.attribution).toEqual({ status: "known", spec: "7d_click" });
    expect(body.origins).toEqual(["real"]);
    expect(body.contextsDivergent).toBe(false);
  });

  it("evento fora do alfabeto rejeitado; vazio = não escolhido", async () => {
    mocks.hasConnection.mockResolvedValue(false);
    expect((await GET(servedAdsRequest(`brandId=${BRAND_ID}&event=<script>`))).status).toBe(400);
    const res = await GET(servedAdsRequest(`brandId=${BRAND_ID}&event=`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event.actionType).toBeNull();
  });

  it("export=csv devolve a mesma consulta em CSV (ICE-01B)", async () => {
    mocks.hasConnection.mockResolvedValue(true);
    mocks.listRows.mockResolvedValue([
      {
        ad_account_id: "1", ad_id: "1:x", creative_id: "x", format: "imagem", text: "t",
        impressions: 2000, clicks: 40, spend: 100, conversions: 14, currency: "BRL",
        actionCounts: { purchase: 4 }, ambiguousActionTypes: [], complete: true,
        snapshot: {
          definitionVersion: 2, currency: "BRL",
          periodStart: "2026-08-18T12:00:00.000Z", periodEnd: "2026-09-17T12:00:00.000Z",
          windowDays: 30, attribution: { status: "unknown", condition: "c" },
          completeness: "complete", origin: "real",
        },
      },
    ]);
    const res = await GET(servedAdsRequest(`brandId=${BRAND_ID}&window=30&event=purchase&export=csv`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("served-ads-30d-purchase.csv");
    const body = await res.text();
    expect(body).toContain("# event,purchase");
    expect(body).toContain("# window_days,30");
    expect(body).toContain("# definition_version,2");
    expect(body).toContain("# mode,live");
    expect(body).toContain("# period_start,2026-08-18T12:00:00.000Z");
    expect(body).toContain("# period_end,2026-09-17T12:00:00.000Z");
    expect(body).toContain("# attribution,unknown:c");
    expect(body).toContain("# origins,real");
    expect(body).toContain("# contexts_divergent,false");
    expect(body).toContain("1:x,1,x,imagem,t,2000,40,100,4,2,2.5,25,measured,purchase");
  });

  it("export inválido rejeitado com a mesma validação", async () => {
    expect((await GET(servedAdsRequest(`brandId=${BRAND_ID}&export=xlsx`))).status).toBe(400);
    expect(mocks.hasConnection).not.toHaveBeenCalled();
  });
});
