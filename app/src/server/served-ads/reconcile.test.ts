import { describe, expect, it } from "vitest";
import {
  reconcileLines,
  runReconcile,
  SERVED_ADS_API_CONTRACT,
  validateApiContract,
  type ReconcileLine,
} from "./reconcile";
import type { MetaGraphClient } from "./graph";

const WS = "123e4567-e89b-12d3-a456-426614174000";
const BRAND = "323e4567-e89b-12d3-a456-426614174002";

function storedLine(overrides: Partial<ReconcileLine> = {}): ReconcileLine {
  return {
    anuncioId: "act1:c1",
    windowDays: 30,
    impressions: 1000,
    clicks: 30,
    spend: 150,
    actionCounts: { purchase: 5 },
    ...overrides,
  };
}

function fakeClient(): MetaGraphClient {
  return {
    listAdAccounts: async () => [{ id: "act1", name: "Loja", currency: "BRL" }],
    listAds: async () => [
      { id: "ad1", creative: { id: "c1", body: "Copy", title: null, imageHash: null, videoId: null, thumbnailUrl: null, isCarousel: false, isDynamic: false } },
    ],
    getInsights: async () => [
      {
        adId: "ad1",
        impressions: 1000,
        clicks: 30,
        spend: 150,
        actions: [{ actionType: "purchase", value: 5 }],
        complete: true,
      },
    ],
    getCreativeMedia: async () => ({ imageUrl: null, videoUrl: null, thumbUrl: null }),
    exchangeCode: async () => ({ accessToken: "x" }),
  };
}

describe("validateApiContract (ICE-01B)", () => {
  it("contrato nomeia versão do Graph, definição e atribuição desconhecida", () => {
    expect(SERVED_ADS_API_CONTRACT.graphVersion).toBe("v26.0");
    expect(SERVED_ADS_API_CONTRACT.definitionVersion).toBe(2);
    expect(SERVED_ADS_API_CONTRACT.attribution).toBe("unknown_until_reconciled");
  });

  it("resposta bem formada passa", () => {
    const check = validateApiContract([
      {
        adId: "ad1",
        impressions: 1000,
        clicks: 30,
        spend: 150,
        actions: [{ actionType: "purchase", value: 5 }],
        complete: true,
      },
    ]);
    expect(check.ok).toBe(true);
  });

  it("violações: forma, negativos, NaN, ação inválida, complete não-booleano", () => {
    expect(validateApiContract({})).toMatchObject({ ok: false });
    expect(validateApiContract([{ adId: "", impressions: 1, clicks: 0, spend: 0, actions: [], complete: true }])).toMatchObject({ ok: false });
    expect(validateApiContract([{ adId: "a", impressions: -1, clicks: 0, spend: 0, actions: [], complete: true }])).toMatchObject({ ok: false });
    expect(validateApiContract([{ adId: "a", impressions: 1, clicks: 0, spend: NaN, actions: [], complete: true }])).toMatchObject({ ok: false });
    expect(validateApiContract([{ adId: "a", impressions: 1, clicks: 0, spend: 0, actions: [{ actionType: "", value: 1 }], complete: true }])).toMatchObject({ ok: false });
    expect(validateApiContract([{ adId: "a", impressions: 1, clicks: 0, spend: 0, actions: [{ actionType: "purchase", value: -2 }], complete: true }])).toMatchObject({ ok: false });
    expect(validateApiContract([{ adId: "a", impressions: 1, clicks: 0, spend: 0, actions: [], complete: "yes" }])).toMatchObject({ ok: false });
    const check = validateApiContract("nada");
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.violations.length).toBeGreaterThan(0);
  });
});

describe("reconcileLines (ICE-01B)", () => {
  it("linhas idênticas reconciliam sem divergência", () => {
    const report = reconcileLines([storedLine()], [storedLine()]);
    expect(report.diverged).toEqual([]);
    expect(report.matched).toBe(1);
    expect(report.lines).toBe(1);
  });

  it("divergências apontam campo, guardado e fresco", () => {
    const report = reconcileLines(
      [storedLine({ impressions: 1000, actionCounts: { purchase: 5 } })],
      [storedLine({ impressions: 1100, actionCounts: { purchase: 4, lead: 1 } })]
    );
    const fields = report.diverged.map((d) => d.field).sort();
    expect(fields).toEqual(["actions:lead", "actions:purchase", "impressions"]);
    expect(report.diverged.find((d) => d.field === "impressions")).toMatchObject({
      stored: 1000,
      fresh: 1100,
    });
    expect(report.matched).toBe(0);
  });

  it("gasto tolera centavo de arredondamento, não valor", () => {
    expect(reconcileLines([storedLine({ spend: 150 })], [storedLine({ spend: 150.005 })]).diverged).toEqual([]);
    expect(
      reconcileLines([storedLine({ spend: 150 })], [storedLine({ spend: 150.5 })]).diverged.map((d) => d.field)
    ).toEqual(["spend"]);
  });

  it("linha só de um lado diverge como ausente, nunca como zero", () => {
    const missing = reconcileLines([storedLine()], []);
    expect(missing.diverged).toHaveLength(1);
    expect(missing.diverged[0]).toMatchObject({
      field: "line_missing_fresh",
      stored: null,
      fresh: null,
    });
    const extra = reconcileLines([], [storedLine()]);
    expect(extra.diverged[0]).toMatchObject({ field: "line_missing_stored" });
  });
});

describe("runReconcile (ICE-01B)", () => {
  const connection = { id: "c", status: "ativa" as const, tokenCiphertext: "cipher" };

  it("resposta real igual ao guardado passa", async () => {
    const outcome = await runReconcile(
      { workspaceId: WS, brandId: BRAND, windows: [30] },
      {
        client: fakeClient(),
        mockMode: false,
        getConnection: async () => connection,
        loadStored: async () => [storedLine()],
      }
    );
    expect(outcome.status).toBe("pass");
    expect(outcome.reason).toBe("reconciled");
    expect(outcome.report?.matched).toBe(1);
  });

  it("sem acesso à Meta, o aceite segue pendente — nunca presumido", async () => {
    const base = { workspaceId: WS, brandId: BRAND, windows: [30] as Array<7 | 30 | 90> };
    const mock = await runReconcile(base, {
      client: fakeClient(),
      mockMode: true,
      getConnection: async () => connection,
      loadStored: async () => [],
    });
    expect(mock).toMatchObject({ status: "pending", reason: "mock_mode_no_real_response" });

    const none = await runReconcile(base, {
      client: fakeClient(),
      mockMode: false,
      getConnection: async () => null,
      loadStored: async () => [],
    });
    expect(none).toMatchObject({ status: "pending", reason: "connection_not_found" });

    const expired = await runReconcile(base, {
      client: fakeClient(),
      mockMode: false,
      getConnection: async () => ({ ...connection, status: "expirada" }),
      loadStored: async () => [],
    });
    expect(expired).toMatchObject({ status: "pending", reason: "connection_not_active" });

    const noToken = await runReconcile(base, {
      client: fakeClient(),
      mockMode: false,
      getConnection: async () => ({ ...connection, tokenCiphertext: null }),
      loadStored: async () => [],
    });
    expect(noToken).toMatchObject({ status: "pending", reason: "connection_token_missing" });
  });

  it("violação de contrato falha antes de comparar", async () => {
    const client = fakeClient();
    client.getInsights = async () => [
      { adId: "ad1", impressions: -5, clicks: 0, spend: 0, actions: [], complete: true },
    ];
    const outcome = await runReconcile(
      { workspaceId: WS, brandId: BRAND, windows: [30] },
      {
        client,
        mockMode: false,
        getConnection: async () => connection,
        loadStored: async () => [storedLine()],
      }
    );
    expect(outcome.status).toBe("fail");
    expect(outcome.reason).toBe("contract_violation");
    expect(outcome.violations?.length).toBeGreaterThan(0);
  });

  it("divergência entre guardado e fresco falha com o relatório", async () => {
    const outcome = await runReconcile(
      { workspaceId: WS, brandId: BRAND, windows: [30] },
      {
        client: fakeClient(),
        mockMode: false,
        getConnection: async () => connection,
        loadStored: async () => [storedLine({ impressions: 999 })],
      }
    );
    expect(outcome.status).toBe("fail");
    expect(outcome.reason).toBe("divergence");
    expect(outcome.report?.diverged.map((d) => d.field)).toEqual(["impressions"]);
  });
});
