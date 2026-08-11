import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MissionPathCard from "./MissionPathCard";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === "progressAria") return `Progresso ${values?.percent}%`;
    if (key === "progressCount") {
      return `${values?.completed}/${values?.total}`;
    }
    if (key.startsWith("items.")) {
      const parts = key.split(".");
      const field = parts[parts.length - 1];
      const missionKey = parts[1];
      if (field === "label") return `Label ${missionKey}`;
      if (field === "description") return `Desc ${missionKey}`;
    }
    if (key === "costSingle") return `Custa ${values?.ads} anuncio`;
    if (key === "costFrom") return `A partir de ${values?.ads} anuncios`;
    if (key === "balance") return `Saldo ${values?.ads} anuncios`;
    if (key === "insufficient") return "Creditos insuficientes";
    if (key === "upgradeHint") return "Precisa de mais?";
    if (key === "upgradeLink") return "Ver cobranca";
    const labels: Record<string, string> = {
      title: "Trilha de Missoes",
      pathLabel: "Trilha do laboratorio",
      activeMission: "Missao ativa",
      cta: "Continuar missao",
      blockedCta: "Complete o passo anterior",
      expand: "Ver trilha",
      collapse: "Ocultar trilha",
      resume: "Retomar",
      done: "Feito",
      error: "Erro ao carregar missoes.",
      retry: "Tentar novamente",
      updating: "Atualizando",
      empty: "Nenhuma missao ativa.",
      allCompleteTitle: "Trilha completa",
      allCompleteDescription: "Voce dominou o fluxo.",
      skipMission: "Pular por agora",
      blockedCtaHint: "Conclua o passo na campanha",
      "blockedResume.default": "Desbloquear",
      "blockedResume.readiness": "Ir para prontidao",
    };
    if (key.startsWith("blockedResume.")) {
      return labels[key] ?? labels["blockedResume.default"];
    }
    return labels[key] ?? key;
  },
}));

vi.mock("@/lib/hooks/use-missions", () => ({
  useMissions: vi.fn(),
}));

vi.mock("@/components/mission-insights/MissionInsightProvider", () => ({
  useMissionInsightOptional: () => null,
}));

const mockUseBillingStatus = vi.fn(() => ({
  data: {
    creditBalance: 50,
    subscriptionStatus: "none" as const,
    access: {
      kind: "beta" as const,
      label: "Beta",
      remainingAds: 10,
      hasSpendAccess: true,
      beta: { totalAds: 10, remainingAds: 10, exhausted: false },
    },
    pastDue: null,
    subscription: null,
    hasCustomer: false,
  },
}));

vi.mock("@/lib/hooks/use-billing", () => ({
  useBillingStatus: () => mockUseBillingStatus(),
  useStartCheckout: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useBillingPortal: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("@/components/billing/ConversionCta", () => ({
  ConversionCta: () => <button type="button">conversion-cta</button>,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/campaigns/1",
}));

import { useMissions } from "@/lib/hooks/use-missions";

const mockUseMissions = vi.mocked(useMissions);

const baseMissions = [
  { key: "setup" as const, status: "completed" as const, href: "/campaigns/1", completedAt: "2026-06-01" },
  { key: "upload" as const, status: "active" as const, href: "/campaigns/1?tab=assets" },
  { key: "readiness" as const, status: "blocked" as const, href: "/campaigns/1", blockedReason: "Envie criativo." },
];

describe("MissionPathCard", () => {
  it("renders loading skeleton", () => {
    mockUseMissions.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    } as ReturnType<typeof useMissions>);

    render(<MissionPathCard />);
    expect(document.querySelector("[aria-busy='true']")).toBeTruthy();
  });

  it("renders active mission CTA", () => {
    mockUseMissions.mockReturnValue({
      data: {
        missions: baseMissions,
        activeMissionKey: "upload",
        completedCount: 1,
        totalCount: 11,
        progressPercent: 9,
        lastCalculatedAt: "2026-06-06T00:00:00.000Z",
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    } as ReturnType<typeof useMissions>);

    render(<MissionPathCard />);
    expect(screen.getByText("Label upload")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Continuar missao/i })).toHaveAttribute(
      "href",
      "/campaigns/1?tab=assets"
    );
  });

  it("keeps credit cost and balance out of an active creative mission", () => {
    mockUseMissions.mockReturnValue({
      data: {
        missions: [
          {
            key: "preview" as const,
            status: "active" as const,
            href: "/campaigns/1?tab=recipes",
            credit: {
              creditCost: 5,
              adCost: 1,
              costLabel: "single" as const,
              insufficientCredits: false,
            },
          },
        ],
        activeMissionKey: "preview",
        completedCount: 5,
        totalCount: 11,
        progressPercent: 45,
        lastCalculatedAt: "2026-06-06T00:00:00.000Z",
        creditContext: {
          remainingCredits: 25,
          remainingAds: 5,
          accessKind: "beta" as const,
          showUpgradePrompt: false,
        },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    } as ReturnType<typeof useMissions>);

    render(<MissionPathCard />);
    expect(screen.queryByText(/Custa 1 anuncio/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Saldo 5 anuncios/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument();
  });

  it("shows upgrade prompt only when gated on", () => {
    mockUseBillingStatus.mockReturnValueOnce({
      data: {
        creditBalance: 2,
        subscriptionStatus: "none",
        access: {
          kind: "beta",
          label: "Beta",
          remainingAds: 0,
          hasSpendAccess: true,
          beta: { totalAds: 10, remainingAds: 0, exhausted: true },
        },
        pastDue: null,
        subscription: null,
        hasCustomer: false,
      },
    });

    mockUseMissions.mockReturnValue({
      data: {
        missions: [
          {
            key: "preview" as const,
            status: "active" as const,
            href: "/campaigns/1?tab=recipes",
            credit: {
              creditCost: 5,
              adCost: 1,
              costLabel: "single" as const,
              insufficientCredits: true,
            },
          },
        ],
        activeMissionKey: "preview",
        completedCount: 3,
        totalCount: 11,
        progressPercent: 27,
        lastCalculatedAt: "2026-06-06T00:00:00.000Z",
        creditContext: {
          remainingCredits: 2,
          remainingAds: 0,
          accessKind: "beta" as const,
          showUpgradePrompt: true,
        },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    } as ReturnType<typeof useMissions>);

    render(<MissionPathCard />);
    expect(screen.getByText(/Creditos insuficientes/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "conversion-cta" })).toBeInTheDocument();
  });

  it("shows blocked resume link for blocked readiness mission", () => {
    mockUseMissions.mockReturnValue({
      data: {
        missions: baseMissions,
        activeMissionKey: "upload",
        completedCount: 1,
        totalCount: 11,
        progressPercent: 9,
        lastCalculatedAt: "2026-06-06T00:00:00.000Z",
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    } as ReturnType<typeof useMissions>);

    render(<MissionPathCard />);
    fireEvent.click(screen.getByRole("button", { name: /Ver trilha/i }));

    expect(screen.getByRole("link", { name: /Ir para prontidao/i })).toHaveAttribute(
      "href",
      "/campaigns/1"
    );
  });

  it("expands mission list on toggle", () => {
    mockUseMissions.mockReturnValue({
      data: {
        missions: baseMissions,
        activeMissionKey: "upload",
        completedCount: 1,
        totalCount: 11,
        progressPercent: 9,
        lastCalculatedAt: "2026-06-06T00:00:00.000Z",
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    } as ReturnType<typeof useMissions>);

    render(<MissionPathCard />);
    fireEvent.click(screen.getByRole("button", { name: /Ver trilha/i }));
    expect(screen.getByText("Label setup")).toBeInTheDocument();
    expect(screen.getByText("Label readiness")).toBeInTheDocument();
  });
});
