import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getConnectionById: vi.fn(),
  upsertAdAccounts: vi.fn(),
  upsertServedAd: vi.fn(),
  updateServedAdMedia: vi.fn(),
  upsertAdMetrics: vi.fn(),
  insertSnapshot: vi.fn(),
  updateConnectionSync: vi.fn(),
  listExpiredServedAds: vi.fn(),
  deleteServedAd: vi.fn(),
  listMediaKeysForConnection: vi.fn(),
  deleteConnection: vi.fn(),
  listActiveConnections: vi.fn(),
}));

vi.mock("@/server/served-ads/repository", () => ({ ...mocks }));

import { MockMetaGraphClient, MetaGraphError } from "./graph";
import {
  disconnectConnection,
  purgeExpiredServedAds,
  syncAllConnections,
  syncConnection,
} from "./sync";

const CONNECTION = {
  id: "conn-1",
  workspaceId: "ws-1",
  status: "ativa" as const,
  tokenCiphertext: "v1:aaa",
  lastSyncAt: null,
  lastSyncError: null,
};

function fakeStorage() {
  return { put: vi.fn(), delete: vi.fn(), signedDownloadUrl: vi.fn() };
}

function fakeDownload() {
  return vi.fn(async (url: string) => ({
    data: Buffer.from(`bytes:${url}`),
    contentType: url.includes("video") ? "video/mp4" : "image/jpeg",
  }));
}

describe("syncConnection (mock Graph)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConnectionById.mockResolvedValue({ ...CONNECTION });
    mocks.upsertAdAccounts.mockImplementation(async (_conn: string, accounts: Array<{ adAccountId: string }>) =>
      accounts.map((account) => ({ id: `row-${account.adAccountId}`, adAccountId: account.adAccountId }))
    );
    mocks.listExpiredServedAds.mockResolvedValue([]);
    mocks.insertSnapshot.mockResolvedValue({ id: "snap-default", definitionVersion: 2 });
  });

  it("agrega 2 ads do mesmo creative em 1 anúncio + métricas nas 3 janelas", async () => {
    const storage = fakeStorage();
    const result = await syncConnection("conn-1", {
      client: new MockMetaGraphClient(),
      storage,
      download: fakeDownload(),
      now: new Date("2026-09-15T12:00:00Z"),
    });
    // 1001 (2 ads), 2001, 3001; ad 509 sem creative fora.
    expect(result).toMatchObject({ accounts: 1, anuncios: 3 });
    expect(mocks.upsertServedAd).toHaveBeenCalledTimes(3);
    const ids = mocks.upsertServedAd.mock.calls.map((call) => (call[0] as { id: string }).id);
    expect(ids.sort()).toEqual(["123:1001", "123:2001", "123:3001"]);
    // 3 anúncios × 3 janelas.
    expect(mocks.upsertAdMetrics).toHaveBeenCalledTimes(9);
    const m30 = mocks.upsertAdMetrics.mock.calls.find(
      (call) => {
        const arg = call[0] as { anuncioId: string; windowDays: number };
        return arg.anuncioId === "123:1001" && arg.windowDays === 30;
      }
    )?.[0] as { impressions: number; spend: number };
    expect(m30.impressions).toBe(60000);
    expect(m30.spend).toBe(2700);
  });

  it("persiste mapa por tipo de ação com snapshot versionado, sem somar tipos", async () => {
    const now = new Date("2026-09-15T12:00:00Z");
    mocks.insertSnapshot.mockImplementation(async (input: { accountId: string; windowDays: number }) => ({
      id: `snap-${input.accountId}-${input.windowDays}`,
      definitionVersion: 2,
      ...input,
    }));
    await syncConnection("conn-1", {
      client: new MockMetaGraphClient(),
      storage: fakeStorage(),
      download: fakeDownload(),
      now,
      origin: "mock",
    });
    // Um snapshot por conta × janela, com período absoluto e coleta carimbada.
    expect(mocks.insertSnapshot).toHaveBeenCalledTimes(3);
    expect(mocks.insertSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      windowDays: 30,
      periodStart: new Date("2026-08-16T12:00:00Z"),
      periodEnd: now,
      currency: "BRL",
      attribution: { status: "unknown", condition: "meta_attribution_not_requested" },
      completeness: "complete",
      origin: "mock",
      collectedAt: now,
    }));
    // 1001 soma o MESMO tipo entre seus 2 ads: purchase 61+22, lead 35+12.
    const m30 = mocks.upsertAdMetrics.mock.calls.find((call) => {
      const arg = call[0] as { anuncioId: string; windowDays: number };
      return arg.anuncioId === "123:1001" && arg.windowDays === 30;
    })?.[0] as { actionCounts: Record<string, number>; definitionVersion: number; snapshotId: string; conversions: number };
    expect(m30.actionCounts).toEqual({ purchase: 83, lead: 47 });
    expect(m30.definitionVersion).toBe(2);
    expect(m30.snapshotId).toBe("snap-row-123-30");
    // A soma antiga segue gravada só para exibição sinalizada de legado.
    expect(m30.conversions).toBe(130);
  });

  it("leitura parcial marca o snapshot e nunca vira número final", async () => {
    const client = new MockMetaGraphClient();
    vi.spyOn(client, "getInsights").mockImplementation(async (accountId: string, windowDays: 7 | 30 | 90) => {
      const rows = await MockMetaGraphClient.prototype.getInsights.call(client, accountId, windowDays);
      return rows.map((row) => ({ ...row, complete: false }));
    });
    mocks.insertSnapshot.mockImplementation(async (input: object) => ({ id: "snap-1", definitionVersion: 2, ...input }));
    await syncConnection("conn-1", { client, storage: fakeStorage(), download: fakeDownload() });
    for (const call of mocks.insertSnapshot.mock.calls) {
      expect(call[0]).toMatchObject({ completeness: "partial" });
    }
  });

  it("valores conflitantes do mesmo tipo vão para ambíguos, fora do mapa", async () => {
    const client = new MockMetaGraphClient();
    vi.spyOn(client, "getInsights").mockResolvedValue([
      {
        adId: "501",
        impressions: 100,
        clicks: 5,
        spend: 10,
        actions: [
          { actionType: "purchase", value: 2 },
          { actionType: "purchase", value: 3 },
          { actionType: "lead", value: 1 },
        ],
        complete: true,
      },
    ]);
    mocks.insertSnapshot.mockImplementation(async (input: object) => ({ id: "snap-1", definitionVersion: 2, ...input }));
    await syncConnection("conn-1", { client, storage: fakeStorage(), download: fakeDownload() });
    const metrics = mocks.upsertAdMetrics.mock.calls.map((call) => call[0]) as Array<{
      actionCounts: Record<string, number>;
      ambiguousActionTypes: string[];
    }>;
    expect(metrics.length).toBeGreaterThan(0);
    for (const metric of metrics) {
      expect(metric.actionCounts).toEqual({ lead: 1 });
      expect(metric.ambiguousActionTypes).toEqual(["purchase"]);
    }
  });

  it("mapeia formato vídeo/carrossel e texto", async () => {
    await syncConnection("conn-1", {
      client: new MockMetaGraphClient(),
      storage: fakeStorage(),
      download: fakeDownload(),
    });
    const byId = new Map(
      mocks.upsertServedAd.mock.calls.map((call) => {
        const arg = call[0] as { id: string; format: string; text: string };
        return [arg.id, arg];
      })
    );
    expect(byId.get("123:2001")?.format).toBe("video");
    expect(byId.get("123:3001")?.format).toBe("carrossel");
    expect(byId.get("123:1001")?.text).toContain("Matrículas abertas");
  });

  it("copia mídia para o R2 e nunca persiste URL da Meta", async () => {
    const storage = fakeStorage();
    const download = fakeDownload();
    await syncConnection("conn-1", { client: new MockMetaGraphClient(), storage, download });
    expect(download).toHaveBeenCalled();
    const putKeys = storage.put.mock.calls.map((call) => call[0] as string);
    expect(putKeys.length).toBeGreaterThan(0);
    for (const key of putKeys) {
      expect(key.startsWith("served-ads/ws-1/")).toBe(true);
      expect(key).not.toContain("http");
    }
    for (const call of mocks.updateServedAdMedia.mock.calls) {
      expect(JSON.stringify(call[1])).not.toContain("http");
    }
  });

  it("falha de download não derruba o sync nem a linha", async () => {
    const storage = fakeStorage();
    const download = vi.fn(async () => {
      throw new Error("rede");
    });
    const result = await syncConnection("conn-1", {
      client: new MockMetaGraphClient(),
      storage,
      download,
    });
    expect(result.anuncios).toBe(3);
    expect(mocks.upsertServedAd).toHaveBeenCalledTimes(3);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("sucesso carimba lastSyncAt e limpa erro", async () => {
    const now = new Date("2026-09-15T12:00:00Z");
    await syncConnection("conn-1", {
      client: new MockMetaGraphClient(),
      storage: fakeStorage(),
      download: fakeDownload(),
      now,
    });
    expect(mocks.updateConnectionSync).toHaveBeenCalledWith("conn-1", {
      lastSyncAt: now,
      lastSyncError: null,
    });
  });

  it("401 da Graph marca expirada e registra erro", async () => {
    const client = new MockMetaGraphClient();
    vi.spyOn(client, "listAdAccounts").mockRejectedValue(new MetaGraphError("bad", 401));
    await expect(
      syncConnection("conn-1", { client, storage: fakeStorage(), download: fakeDownload() })
    ).rejects.toThrow("bad");
    expect(mocks.updateConnectionSync).toHaveBeenCalledWith(
      "conn-1",
      expect.objectContaining({ status: "expirada", lastSyncError: expect.stringContaining("bad") })
    );
  });

  it("erro genérico registra sem trocar status", async () => {
    const client = new MockMetaGraphClient();
    vi.spyOn(client, "listAdAccounts").mockRejectedValue(new Error("boom"));
    await expect(
      syncConnection("conn-1", { client, storage: fakeStorage(), download: fakeDownload() })
    ).rejects.toThrow("boom");
    expect(mocks.updateConnectionSync).toHaveBeenCalledWith(
      "conn-1",
      expect.objectContaining({ lastSyncError: expect.stringContaining("boom") })
    );
    expect(mocks.updateConnectionSync.mock.calls[0]?.[1]).not.toHaveProperty("status");
  });

  it("conexão inexistente/inativa/sem token falha antes da Graph", async () => {
    const client = new MockMetaGraphClient();
    const listSpy = vi.spyOn(client, "listAdAccounts");
    mocks.getConnectionById.mockResolvedValueOnce(null);
    await expect(syncConnection("x", { client })).rejects.toThrow("connectionNotFound");
    mocks.getConnectionById.mockResolvedValueOnce({ ...CONNECTION, status: "expirada" });
    await expect(syncConnection("x", { client })).rejects.toThrow("connectionNotActive");
    mocks.getConnectionById.mockResolvedValueOnce({ ...CONNECTION, tokenCiphertext: null });
    await expect(syncConnection("x", { client })).rejects.toThrow("connectionTokenMissing");
    expect(listSpy).not.toHaveBeenCalled();
  });
});

describe("purge + disconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TTL apaga R2 e linha dos expirados", async () => {
    const storage = fakeStorage();
    mocks.listExpiredServedAds.mockResolvedValue([
      { anuncioId: "123:9", imageKey: "k-img", videoKey: null, thumbKey: "k-thumb" },
    ]);
    const purged = await purgeExpiredServedAds({
      storage,
      now: new Date("2026-09-15T12:00:00Z"),
    });
    expect(purged).toBe(1);
    expect(mocks.listExpiredServedAds).toHaveBeenCalledWith(new Date("2026-06-17T12:00:00Z"));
    expect(storage.delete.mock.calls.map((call) => call[0]).sort()).toEqual(["k-img", "k-thumb"]);
    expect(mocks.deleteServedAd).toHaveBeenCalledWith("123:9");
  });

  it("disconnect apaga mídia de todos e depois a conexão", async () => {
    const storage = fakeStorage();
    const order: string[] = [];
    storage.delete.mockImplementation(async () => {
      order.push("r2");
    });
    mocks.listMediaKeysForConnection.mockResolvedValue([
      { anuncioId: "123:1", imageKey: "a", videoKey: null, thumbKey: null },
      { anuncioId: "123:2", imageKey: null, videoKey: "b", thumbKey: "c" },
    ]);
    mocks.deleteConnection.mockImplementation(async () => {
      order.push("db");
    });
    await disconnectConnection("conn-1", { storage });
    expect(storage.delete).toHaveBeenCalledTimes(3);
    expect(order).toEqual(["r2", "r2", "r2", "db"]);
  });

  it("syncAll continua após falha individual", async () => {
    mocks.listActiveConnections.mockResolvedValue([
      { ...CONNECTION, id: "a" },
      { ...CONNECTION, id: "b" },
    ]);
    mocks.getConnectionById.mockImplementation(async (id: string) =>
      id === "a" ? { ...CONNECTION, id: "a" } : null
    );
    mocks.upsertAdAccounts.mockResolvedValue([]);
    mocks.listExpiredServedAds.mockResolvedValue([]);
    const result = await syncAllConnections({
      client: new MockMetaGraphClient(),
      storage: fakeStorage(),
      download: fakeDownload(),
    });
    expect(result).toEqual({ synced: 1, failed: 1, purged: 0 });
  });
});
