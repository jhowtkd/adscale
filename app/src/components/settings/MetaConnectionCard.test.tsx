import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) =>
    (
      {
        title: "Meta Ads",
        description: "Conecte para ler anúncios.",
        connect: "Conectar",
        disconnect: "Desconectar",
        confirmDisconnect: "Confirmar",
        syncNow: "Atualizar agora",
        mockBadge: "mock",
        neverSynced: "Nunca sincronizado",
        unlinked: "Sem marca",
        linkLabel: "Marca",
        connectedToast: "Conectado.",
        syncQueued: "Sync agendado.",
        disconnected: "Desconectado.",
        forbidden: "Sem permissão.",
        "status.ativa": "Ativa",
        "status.disconnected": "Desconectada",
      }[key] ?? (params?.when ? `${key}:${params.when}` : key)
    ),
}));

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));

const addToastMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/store", () => ({ useAppStore: () => addToastMock }));

import { MetaConnectionCard } from "./MetaConnectionCard";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

const STATUS_OFF = { connected: false, mock: true };
const STATUS_ON = {
  connected: true,
  mock: true,
  status: "ativa",
  lastSyncAt: null,
  lastSyncError: null,
  accounts: [{ id: "a1", adAccountId: "123", name: "Mock", currency: "BRL", brandId: null }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MetaConnectionCard", () => {
  it("desconectado mostra botão de connect para o OAuth", async () => {
    apiFetchMock
      .mockResolvedValueOnce(jsonResponse(STATUS_OFF))
      .mockResolvedValueOnce(jsonResponse({ profiles: [] }));
    render(<MetaConnectionCard />);
    const link = await screen.findByTestId("meta-connect");
    expect(link.getAttribute("href")).toBe("/api/workspace/meta-connection/oauth/start");
  });

  it("conectado lista contas, sync e disconnect em dois cliques", async () => {
    apiFetchMock
      .mockResolvedValueOnce(jsonResponse(STATUS_ON))
      .mockResolvedValueOnce(jsonResponse({ profiles: [{ id: "b1", name: "Marca" }] }))
      .mockResolvedValueOnce(jsonResponse({ sync: "queued" }, 202))
      .mockResolvedValueOnce(jsonResponse(STATUS_ON))
      .mockResolvedValueOnce(jsonResponse({ disconnected: true }))
      .mockResolvedValueOnce(jsonResponse(STATUS_OFF));
    render(<MetaConnectionCard />);
    expect(await screen.findByText("Mock")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("meta-sync-now"));
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith("/api/workspace/meta-connection/sync", { method: "POST" })
    );
    fireEvent.click(screen.getByTestId("meta-disconnect"));
    fireEvent.click(screen.getByTestId("meta-disconnect"));
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith("/api/workspace/meta-connection", { method: "DELETE" })
    );
  });

  it("vincula conta à marca pelo select", async () => {
    apiFetchMock
      .mockResolvedValueOnce(jsonResponse(STATUS_ON))
      .mockResolvedValueOnce(jsonResponse({ profiles: [{ id: "b1", name: "Marca" }] }))
      .mockResolvedValueOnce(jsonResponse({ linked: true }))
      .mockResolvedValueOnce(jsonResponse(STATUS_ON));
    render(<MetaConnectionCard />);
    const select = (await screen.findByTestId("meta-link-a1")) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "b1" } });
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith("/api/workspace/meta-connection/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: "a1", brandId: "b1" }),
      })
    );
  });

  it("mostra erro de sync e badge mock", async () => {
    apiFetchMock
      .mockResolvedValueOnce(
        jsonResponse({ ...STATUS_ON, lastSyncError: "token expirado", accounts: [] })
      )
      .mockResolvedValueOnce(jsonResponse({ profiles: [] }));
    render(<MetaConnectionCard />);
    expect(await screen.findByText("token expirado")).toBeInTheDocument();
    expect(screen.getByText(/mock/)).toBeInTheDocument();
  });
});
