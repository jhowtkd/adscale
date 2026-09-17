import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  AUTHORIZED_RESYNC_WINDOWS,
  executeResync,
  parseResyncArgs,
  type ResyncConnection,
} from "./resync";
import type { MetaGraphClient } from "./graph";

const WS = "123e4567-e89b-12d3-a456-426614174000";
const CONN = "223e4567-e89b-12d3-a456-426614174001";

const mocks = vi.hoisted(() => ({
  getById: vi.fn(),
  getByWorkspace: vi.fn(),
  upsertAccounts: vi.fn(),
  insertSnapshot: vi.fn(),
  upsertMetrics: vi.fn(),
  upsertAd: vi.fn(),
}));
vi.mock("./repository", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    getConnectionById: (...args: unknown[]) => mocks.getById(...args),
    getConnectionByWorkspace: (...args: unknown[]) => mocks.getByWorkspace(...args),
    upsertAdAccounts: (...args: unknown[]) => mocks.upsertAccounts(...args),
    insertSnapshot: (...args: unknown[]) => mocks.insertSnapshot(...args),
    upsertServedAd: (...args: unknown[]) => mocks.upsertAd(...args),
    upsertAdMetrics: (...args: unknown[]) => mocks.upsertMetrics(...args),
  };
});

function connection(overrides: Partial<ResyncConnection> = {}): ResyncConnection {
  return {
    id: CONN,
    workspaceId: WS,
    status: "ativa",
    tokenCiphertext: "cipher",
    ...overrides,
  };
}

function fakeClient(): MetaGraphClient {
  return {
    listAdAccounts: async () => [{ id: "act1", name: "Loja", currency: "BRL" }],
    listAds: async () => [
      { id: "ad1", creative: { id: "c1", body: "Copy", title: null, imageHash: null, videoId: null, thumbnailUrl: null, isCarousel: false, isDynamic: false } },
    ],
    getInsights: async (_accountId: string, windowDays: 7 | 30 | 90) => [
      {
        adId: "ad1",
        impressions: 1000 * windowDays,
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

describe("parseResyncArgs (ICE-01B)", () => {
  it("dry-run é o padrão; workspace e janelas explícitos", () => {
    const plan = parseResyncArgs(["--workspace", WS, "--windows", "7,30"]);
    expect(plan).toEqual({ ok: true, plan: { workspaceId: WS, windows: [7, 30], dryRun: true } });
  });

  it("--apply executa; conexão é filtro opcional", () => {
    const plan = parseResyncArgs([
      "--workspace", WS, "--windows", "90", "--connection", CONN, "--apply",
    ]);
    expect(plan).toEqual({
      ok: true,
      plan: { workspaceId: WS, windows: [90], connectionId: CONN, dryRun: false },
    });
  });

  it("só janelas autorizadas; fora delas, erro sem efeito", () => {
    expect(AUTHORIZED_RESYNC_WINDOWS).toEqual([7, 30, 90]);
    expect(parseResyncArgs(["--workspace", WS, "--windows", "60"])).toMatchObject({ ok: false });
    expect(parseResyncArgs(["--workspace", WS, "--windows", "7,60"])).toMatchObject({ ok: false });
    expect(parseResyncArgs(["--workspace", WS, "--windows", ""])).toMatchObject({ ok: false });
  });

  it("workspace obrigatório e uuid; flags desconhecidas rejeitadas", () => {
    expect(parseResyncArgs(["--windows", "7"])).toMatchObject({ ok: false });
    expect(parseResyncArgs(["--workspace", "abc", "--windows", "7"])).toMatchObject({ ok: false });
    expect(parseResyncArgs(["--workspace", WS, "--windows", "7", "--force"])).toMatchObject({
      ok: false,
    });
    expect(parseResyncArgs(["--workspace", WS])).toMatchObject({ ok: false });
  });
});

describe("executeResync (ICE-01B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsertAccounts.mockResolvedValue([{ id: "row1", adAccountId: "act1" }]);
    mocks.insertSnapshot.mockImplementation(async (input: { windowDays: number }) => ({
      id: `snap-${input.windowDays}`,
      ...input,
    }));
  });

  it("cria NOVO snapshot por conta+janela e aponta as métricas para ele", async () => {
    mocks.getByWorkspace.mockResolvedValue(connection());
    const results = await executeResync(
      { workspaceId: WS, windows: [7, 30], dryRun: false },
      { client: fakeClient(), now: new Date("2026-09-17T12:00:00.000Z") }
    );
    expect(results).toHaveLength(2);
    expect(mocks.insertSnapshot).toHaveBeenCalledTimes(2);
    // Histórico preservado: só insere, nunca apaga nem reescreve snapshot.
    expect(mocks.upsertMetrics).toHaveBeenCalledTimes(2);
    expect(mocks.upsertMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ anuncioId: "act1:c1", windowDays: 7, snapshotId: "snap-7" })
    );
    expect(mocks.upsertMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ anuncioId: "act1:c1", windowDays: 30, snapshotId: "snap-30" })
    );
    expect(results[0]).toMatchObject({ windowDays: 7, snapshotId: "snap-7", anuncios: 1 });
  });

  it("sem detalhe original não fabrica evento: mapa vazio, sem reconstruir compra", async () => {
    mocks.getByWorkspace.mockResolvedValue(connection());
    const client = fakeClient();
    client.getInsights = async () => [
      { adId: "ad1", impressions: 500, clicks: 5, spend: 10, actions: [], complete: true },
    ];
    await executeResync({ workspaceId: WS, windows: [30], dryRun: false }, { client });
    expect(mocks.upsertMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ actionCounts: {}, conversions: 0 })
    );
  });

  it("conexão de outro workspace nunca ressincroniza aqui", async () => {
    mocks.getById.mockResolvedValue(connection({ id: CONN, workspaceId: "outro" }));
    await expect(
      executeResync(
        { workspaceId: WS, windows: [7], connectionId: CONN, dryRun: false },
        { client: fakeClient() }
      )
    ).rejects.toThrow("connectionWorkspaceMismatch");
    expect(mocks.insertSnapshot).not.toHaveBeenCalled();
  });

  it("sem conexão ativa ou sem token, falha antes de qualquer escrita", async () => {
    mocks.getByWorkspace.mockResolvedValue(null);
    await expect(
      executeResync({ workspaceId: WS, windows: [7], dryRun: false }, { client: fakeClient() })
    ).rejects.toThrow("connectionNotFound");
    mocks.getByWorkspace.mockResolvedValue(connection({ status: "expirada" }));
    await expect(
      executeResync({ workspaceId: WS, windows: [7], dryRun: false }, { client: fakeClient() })
    ).rejects.toThrow("connectionNotActive");
    expect(mocks.insertSnapshot).not.toHaveBeenCalled();
    expect(mocks.upsertMetrics).not.toHaveBeenCalled();
  });
});
