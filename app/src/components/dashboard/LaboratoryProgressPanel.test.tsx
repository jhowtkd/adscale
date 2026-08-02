import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LaboratoryProgressPanel from "./LaboratoryProgressPanel";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    if (namespace === "dashboard.laboratory") {
      if (key === "stepLabel") return `Passo ${values?.current} de ${values?.total}`;
      const labels: Record<string, string> = {
        title: "Laboratorio de Ads",
        whatToDoNow: "O que fazer agora",
        error: "Erro ao carregar progresso.",
        retry: "Tentar novamente",
        updating: "Atualizando",
      };
      return labels[key] ?? key;
    }

    if (namespace === "dashboard.progression") {
      const progressionLabels: Record<string, string> = {
        "levels.analista_criativo.label": "Analista Criativo",
        "levels.analista_criativo.shortLabel": "Analista",
        "levels.analista_criativo.description": "Voce ja aprovou um criativo real.",
      };
      return progressionLabels[key] ?? key;
    }

    if (key === "progressAria") return `Progresso ${values?.percent}%`;
    if (key === "progressCount") return `${values?.completed}/${values?.total}`;
    if (key.startsWith("items.")) {
      const parts = key.split(".");
      const field = parts[parts.length - 1];
      const missionKey = parts[1];
      if (field === "label") return `Label ${missionKey}`;
      if (field === "description") return `Desc ${missionKey}`;
    }
    const labels: Record<string, string> = {
      cta: "Continuar missao",
      blockedCta: "Complete o passo anterior",
      blockedCtaHint: "Conclua o passo na campanha",
      expand: "Ver trilha",
      collapse: "Ocultar trilha",
      resume: "Retomar",
      done: "Feito",
      empty: "Nenhuma missao ativa.",
      allCompleteTitle: "Trilha completa",
      allCompleteDescription: "Voce dominou o fluxo.",
      skipMission: "Pular por agora",
      "blockedResume.default": "Desbloquear",
      "blockedReasons.readiness": "Envie um criativo base antes.",
    };
    if (key.startsWith("blockedResume.")) {
      return labels[key] ?? labels["blockedResume.default"];
    }
    return labels[key] ?? key;
  },
}));

vi.mock("@/lib/hooks/use-progression", () => ({
  useProgression: vi.fn(),
}));

vi.mock("@/lib/hooks/use-missions", () => ({
  useMissions: vi.fn(),
}));

vi.mock("@/components/mission-insights/MissionInsightProvider", () => ({
  useMissionInsightOptional: () => null,
}));

vi.mock("@/lib/hooks/use-billing", () => ({
  useBillingStatus: vi.fn(() => ({ data: undefined })),
}));

import { useProgression } from "@/lib/hooks/use-progression";
import { useMissions } from "@/lib/hooks/use-missions";

const mockUseProgression = vi.mocked(useProgression);
const mockUseMissions = vi.mocked(useMissions);

const progressionFixture = {
  level: {
    key: "analista_criativo" as const,
    label: "Analista Criativo",
    shortLabel: "Analista",
    description: "Voce ja aprovou um criativo real.",
  },
  progressPercent: 71,
  completed: [],
  nextAction: {
    key: "readiness_ran" as const,
    label: "Analise de prontidao",
    description: "Rode a analise.",
    href: "/campaigns/c1",
    blocked: false,
  },
  lastCalculatedAt: new Date().toISOString(),
};

const missionsFixture = {
  missions: [
    { key: "setup" as const, status: "completed" as const, href: "/campaigns" },
    {
      key: "readiness" as const,
      status: "active" as const,
      href: "/campaigns/c1/readiness",
    },
  ],
  activeMissionKey: "readiness" as const,
  completedCount: 8,
  totalCount: 11,
  progressPercent: 82,
  lastCalculatedAt: new Date().toISOString(),
  creditContext: undefined,
};

describe("LaboratoryProgressPanel", () => {
  it("renders loading skeleton", () => {
    mockUseProgression.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    } as ReturnType<typeof useProgression>);
    mockUseMissions.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    } as ReturnType<typeof useMissions>);

    render(<LaboratoryProgressPanel />);
    expect(document.querySelector("[aria-busy='true']")).toBeTruthy();
  });

  it("renders unified progress with single CTA", () => {
    mockUseProgression.mockReturnValue({
      data: progressionFixture,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    } as ReturnType<typeof useProgression>);
    mockUseMissions.mockReturnValue({
      data: missionsFixture,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    } as ReturnType<typeof useMissions>);

    render(<LaboratoryProgressPanel />);

    expect(screen.getByRole("heading", { name: /Laboratorio de Ads/i })).toBeInTheDocument();
    expect(screen.getByText("Analista")).toBeInTheDocument();
    expect(screen.getByText("8/11")).toBeInTheDocument();
    expect(screen.getByText("Passo 9 de 11")).toBeInTheDocument();
    expect(screen.getByText("82%").closest("[data-motion-value]")).toHaveAttribute(
      "data-motion-value",
      "82%",
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "82");
    expect(screen.getByRole("progressbar").firstElementChild).toHaveStyle({
      transform: "scaleX(0.82)",
    });
    expect(screen.getByText("O que fazer agora")).toBeInTheDocument();
    expect(screen.getByText("Label readiness")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Continuar missao/i })).toHaveAttribute(
      "href",
      "/campaigns/c1/readiness",
    );
    expect(screen.queryByText(/Continuar experimento/i)).not.toBeInTheDocument();
  });

  it("expands mission list", () => {
    mockUseProgression.mockReturnValue({
      data: progressionFixture,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    } as ReturnType<typeof useProgression>);
    mockUseMissions.mockReturnValue({
      data: missionsFixture,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    } as ReturnType<typeof useMissions>);

    render(<LaboratoryProgressPanel />);

    fireEvent.click(screen.getByRole("button", { name: /Ver trilha/i }));
    expect(screen.getByText("Label setup")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ocultar trilha/i })).toHaveAttribute("aria-expanded", "true");
  });
});
