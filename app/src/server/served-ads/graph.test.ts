import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: {
    META_APP_ID: "mock-app",
    META_APP_SECRET: "mock-secret",
    META_GRAPH_MOCK: "false",
  },
}));

import {
  MockMetaGraphClient,
  RealMetaGraphClient,
  buildOAuthStartUrl,
  getGraphClient,
  isMockMode,
} from "./graph";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("MetaGraphClient mock", () => {
  const client = new MockMetaGraphClient();

  it("conta determinística em BRL", async () => {
    await expect(client.listAdAccounts()).resolves.toEqual([
      { id: "123", name: "Mock Ad Account", currency: "BRL" },
    ]);
  });

  it("ads cobrem imagem repetida, vídeo, carrossel e sem-creative", async () => {
    const ads = await client.listAds("123");
    expect(ads.map((ad) => ad.creative.id)).toEqual(["1001", "1001", "2001", "3001", null]);
    expect(ads.find((ad) => ad.id === "505")?.creative.isCarousel).toBe(true);
    expect(ads.find((ad) => ad.id === "504")?.creative.videoId).toBe("vid2001");
  });

  it("insights escalam por janela e repetem determinísticos", async () => {
    const d30 = await client.getInsights("123", 30);
    const d30b = await client.getInsights("123", 30);
    expect(d30).toEqual(d30b);
    const d7 = await client.getInsights("123", 7);
    expect(d7[0]?.impressions).toBe(Math.round((d30[0]?.impressions ?? 0) * 0.25));
    const d90 = await client.getInsights("123", 90);
    expect(d90[0]?.impressions).toBe(Math.round((d30[0]?.impressions ?? 0) * 2.5));
  });

  it("mock relata contagens por tipo de ação, sem soma", async () => {
    const d30 = await client.getInsights("123", 30);
    expect(d30[0]).toMatchObject({
      adId: "501",
      actions: [
        { actionType: "purchase", value: 61 },
        { actionType: "lead", value: 35 },
      ],
      complete: true,
    });
    expect(d30[0]).not.toHaveProperty("conversions");
  });

  it("mídia do mock nunca aponta para a Meta", async () => {
    const ads = await client.listAds("123");
    for (const ad of ads) {
      const media = await client.getCreativeMedia("123", ad.creative);
      for (const url of [media.imageUrl, media.videoUrl, media.thumbUrl]) {
        expect(url === null || !url.includes("facebook.com")).toBe(true);
        expect(url === null || !url.includes("fbcdn.net")).toBe(true);
      }
    }
  });

  it("exchange mock devolve token determinístico", async () => {
    await expect(client.exchangeCode("x", "y")).resolves.toEqual({
      accessToken: "mock-system-user-token",
    });
  });
});

describe("RealMetaGraphClient (fetch stub)", () => {
  it("lista contas normalizando act_ e pagina cursores", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ account_id: "act_10", name: "A", currency: "BRL" }],
          paging: { next: "https://graph.facebook.com/next" },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ account_id: "20", name: "B" }], paging: {} })
      );
    const client = new RealMetaGraphClient("tok", fetchFn as unknown as typeof fetch);
    await expect(client.listAdAccounts()).resolves.toEqual([
      { id: "10", name: "A", currency: "BRL" },
      { id: "20", name: "B", currency: "BRL" },
    ]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(String(fetchFn.mock.calls[0]?.[0])).toContain("/v26.0/me/adaccounts");
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({
      headers: { authorization: "Bearer tok" },
    });
  });

  it("mapeia creative aninhado, carrossel e dinâmico", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: "1",
            creative: {
              id: "c1",
              body: "b",
              title: "t",
              image_hash: "h",
              object_story_spec: { link_data: { child_attachments: [{}, {}] } },
            },
          },
          { id: "2", creative: { id: "c2", asset_feed_spec: {} } },
          { id: "3", creative: null },
        ],
        paging: {},
      })
    );
    const client = new RealMetaGraphClient("tok", fetchFn as unknown as typeof fetch);
    const ads = await client.listAds("10");
    expect(ads[0]?.creative.isCarousel).toBe(true);
    expect(ads[1]?.creative.isDynamic).toBe(true);
    expect(ads[2]?.creative.id).toBeNull();
    expect(String(fetchFn.mock.calls[0]?.[0])).toContain("act_10/ads");
  });

  it("insights preservam actions por tipo, nunca somam, e usam preset da janela", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            ad_id: "1",
            impressions: "100",
            clicks: "5",
            spend: "12.5",
            actions: [
              { action_type: "purchase", value: "2" },
              { action_type: "lead", value: "1" },
            ],
          },
        ],
        paging: {},
      })
    );
    const client = new RealMetaGraphClient("tok", fetchFn as unknown as typeof fetch);
    await expect(client.getInsights("10", 7)).resolves.toEqual([
      {
        adId: "1",
        impressions: 100,
        clicks: 5,
        spend: 12.5,
        actions: [
          { actionType: "purchase", value: 2 },
          { actionType: "lead", value: 1 },
        ],
        complete: true,
      },
    ]);
    const url = String(fetchFn.mock.calls[0]?.[0]);
    expect(url).toContain("level=ad");
    expect(url).toContain("date_preset=last_7d");
  });

  it("insights sem actions relatam mapa vazio, não zero presumido", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({ data: [{ ad_id: "1", impressions: "10", clicks: "1", spend: "2" }], paging: {} })
    );
    const client = new RealMetaGraphClient("tok", fetchFn as unknown as typeof fetch);
    await expect(client.getInsights("10", 7)).resolves.toEqual([
      { adId: "1", impressions: 10, clicks: 1, spend: 2, actions: [], complete: true },
    ]);
  });

  it("erro da Graph vira MetaGraphError com mensagem", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: "bad token" } }, 400));
    const client = new RealMetaGraphClient("tok", fetchFn as unknown as typeof fetch);
    await expect(client.listAdAccounts()).rejects.toThrow("bad token");
  });
});

describe("OAuth start + seleção mock/real", () => {
  it("start monta dialog v26.0 com os 3 escopos", () => {
    const url = new URL(
      buildOAuthStartUrl({ appId: "app", redirectUri: "https://x/cb", state: "s" })
    );
    expect(url.hostname).toBe("www.facebook.com");
    expect(url.pathname).toBe("/v26.0/dialog/oauth");
    expect(url.searchParams.get("scope")).toBe("ads_read,ads_management,business_management");
    expect(url.searchParams.get("state")).toBe("s");
  });

  it("sem token cai no mock", () => {
    expect(getGraphClient(undefined)).toBeInstanceOf(MockMetaGraphClient);
  });

  it("com app + token usa o real", () => {
    expect(getGraphClient("tok")).toBeInstanceOf(RealMetaGraphClient);
  });

  it("isMockMode reflete app ausente", () => {
    expect(isMockMode()).toBe(false);
  });
});
