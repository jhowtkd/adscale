import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    (
      {
        title: "Anúncios veiculados",
        subtitle: "O que performa agora",
        window7: "7 dias",
        window30: "30 dias",
        window90: "90 dias",
        formatAll: "Todos",
        formatImagem: "Imagem",
        formatVideo: "Vídeo",
        formatCarrossel: "Carrossel",
        colCreative: "Criativo",
        colSpend: "Gasto",
        colImpressions: "Impressões",
        colCtr: "CTR",
        colCpc: "CPC",
        colResults: "Resultados",
        colCpa: "CPA",
        insufficientEvidence: "sem evidência suficiente",
        unverifiedMeasure: "não validado",
        fixtureBadge: "dados de exemplo",
        multiCurrency: "múltiplas moedas",
        noBrandTitle: "Selecione uma marca",
        noBrandDescription: "Escolha a marca ativa.",
        noBrandAction: "Ver marcas",
        emptyTitle: "Nenhum anúncio",
        emptyDescription: "Sem entrega.",
        loading: "Carregando…",
        loadError: "Falhou.",
      }[key] ?? key
    ),
  useLocale: () => "pt-BR",
}));

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));

const storeState = vi.hoisted(() => ({ activeClientProfileId: "brand-1" as string | null }));
vi.mock("@/lib/store", () => ({
  useAppStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));

import { ServedAdsView } from "./ServedAdsView";

const baseRow = {
  anuncioId: "1:c1",
  format: "imagem",
  text: "Copy vencedora",
  impressions: 5000,
  clicks: 150,
  spend: 750,
  conversions: 12,
  ctr: 3,
  cpc: 5,
  cpa: 62.5,
  conversion: { definitionVersion: 2, actionType: "purchase", value: 12, status: "measured" },
  insufficientEvidence: false,
  previewUrl: null,
};

function reportResponse(rows: unknown[], overrides = {}) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        mode: "fixture",
        currencies: ["BRL"],
        primaryCurrency: "BRL",
        hasConversions: true,
        rows,
        ...overrides,
      }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storeState.activeClientProfileId = "brand-1";
});

describe("ServedAdsView", () => {
  it("lista ordenada com colunas sempre + resultados/CPA quando há conversão", async () => {
    apiFetchMock.mockResolvedValue(
      reportResponse([
        baseRow,
        { ...baseRow, anuncioId: "1:c2", text: "Copy nova", impressions: 200, ctr: 9, insufficientEvidence: true },
      ])
    );
    render(<ServedAdsView />);
    const rows = await screen.findAllByTestId("served-ad-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Copy vencedora")).toBeInTheDocument();
    expect(within(rows[1]).getByText("sem evidência suficiente")).toBeInTheDocument();
    expect(screen.getByText("Resultados")).toBeInTheDocument();
    expect(screen.getByText("dados de exemplo")).toBeInTheDocument();
  });

  it("esconde resultados/CPA sem conversão na conta", async () => {
    apiFetchMock.mockResolvedValue(reportResponse([{ ...baseRow, conversions: 0, cpa: null }], { hasConversions: false }));
    render(<ServedAdsView />);
    await screen.findByTestId("served-ad-row");
    expect(screen.queryByText("Resultados")).not.toBeInTheDocument();
    expect(screen.queryByText("CPA")).not.toBeInTheDocument();
  });

  it("trocar janela e formato refaz a busca", async () => {
    apiFetchMock.mockResolvedValue(reportResponse([baseRow]));
    render(<ServedAdsView />);
    await screen.findByTestId("served-ad-row");
    fireEvent.click(screen.getByTestId("served-ads-window-7"));
    fireEvent.click(screen.getByTestId("served-ads-format-video"));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(3));
    const lastUrl = String(apiFetchMock.mock.calls[2][0]);
    expect(lastUrl).toContain("window=7");
    expect(lastUrl).toContain("format=video");
    expect(lastUrl).toContain("brandId=brand-1");
  });

  it("sem marca ativa, pede seleção em vez de buscar", async () => {
    storeState.activeClientProfileId = null;
    render(<ServedAdsView />);
    expect(screen.getByText("Selecione uma marca")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("falha de rede mostra erro", async () => {
    apiFetchMock.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
    render(<ServedAdsView />);
    expect(await screen.findByText("Falhou.")).toBeInTheDocument();
  });

  it("contenção: soma legada exibe sinalização de não validado e CPA indisponível", async () => {
    apiFetchMock.mockResolvedValue(
      reportResponse([
        {
          ...baseRow,
          conversions: 130,
          cpa: null,
          conversion: { definitionVersion: 2, actionType: null, value: null, status: "legacy_unverified" },
        },
      ])
    );
    render(<ServedAdsView />);
    const rows = await screen.findAllByTestId("served-ad-row");
    expect(within(rows[0]).getByText("não validado")).toBeInTheDocument();
    expect(within(rows[0]).getByText("130")).toBeInTheDocument();
  });

  it("medida ausente mostra traço, nunca zero", async () => {
    apiFetchMock.mockResolvedValue(
      reportResponse([
        {
          ...baseRow,
          conversions: null,
          cpa: null,
          conversion: { definitionVersion: 2, actionType: null, value: null, status: "not_defined" },
        },
      ])
    );
    render(<ServedAdsView />);
    const rows = await screen.findAllByTestId("served-ad-row");
    const cells = within(rows[0]).getAllByText("—");
    expect(cells.length).toBeGreaterThanOrEqual(2);
    expect(within(rows[0]).queryByText("0")).not.toBeInTheDocument();
  });
});
