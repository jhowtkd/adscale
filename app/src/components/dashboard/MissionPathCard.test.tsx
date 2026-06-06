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
    };
    return labels[key] ?? key;
  },
}));

vi.mock("@/lib/hooks/use-missions", () => ({
  useMissions: vi.fn(),
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
