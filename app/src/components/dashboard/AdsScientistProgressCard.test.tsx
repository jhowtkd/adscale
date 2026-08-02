import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdsScientistProgressCard from "./AdsScientistProgressCard";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === "progressAria") return `Progresso ${values?.percent}%`;
    const labels: Record<string, string> = {
      title: "Cientista de Ads",
      currentLevel: "Nivel atual",
      progressLabel: "Progresso do laboratorio",
      nextExperiment: "Proximo experimento",
      cta: "Continuar experimento",
      blockedCta: "Complete o passo anterior",
      error: "Nao foi possivel carregar seu progresso.",
      retry: "Tentar novamente",
      updating: "Atualizando progresso",
      "levels.aprendiz.label": "Aprendiz de Laboratorio",
      "levels.aprendiz.description": "Monte seu laboratorio.",
      "evidence.campaign_created.label": "Primeira campanha",
      "evidence.campaign_created.description": "Crie sua primeira campanha.",
      "evidence.readiness_ran.label": "Analise de prontidao",
      "evidence.readiness_ran.description": "Rode a analise.",
      "blockedReasons.readiness_ran": "Envie um criativo base antes.",
    };
    return labels[key] ?? key;
  },
}));

vi.mock("@/lib/hooks/use-progression", () => ({
  useProgression: vi.fn(),
}));

import { useProgression } from "@/lib/hooks/use-progression";

const mockUseProgression = vi.mocked(useProgression);

describe("AdsScientistProgressCard", () => {
  it("renders loading skeleton", () => {
    mockUseProgression.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    } as ReturnType<typeof useProgression>);

    render(<AdsScientistProgressCard />);
    expect(document.querySelector("[aria-busy='true']")).toBeTruthy();
  });

  it("renders progression data and CTA", () => {
    mockUseProgression.mockReturnValue({
      data: {
        level: {
          key: "aprendiz",
          label: "Aprendiz de Laboratorio",
          shortLabel: "Aprendiz",
          description: "Monte seu laboratorio.",
        },
        progressPercent: 28,
        completed: [],
        nextAction: {
          key: "campaign_created",
          label: "Primeira campanha",
          description: "Crie sua primeira campanha.",
          href: "/campaigns?new=1",
          blocked: false,
        },
        lastCalculatedAt: "2026-06-06T00:00:00.000Z",
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    } as ReturnType<typeof useProgression>);

    render(<AdsScientistProgressCard />);

    expect(screen.getByText("Aprendiz de Laboratorio")).toBeInTheDocument();
    expect(screen.getByText("Primeira campanha")).toBeInTheDocument();
    expect(screen.getByTestId("motion-value")).toHaveAttribute("data-motion-value", "28%");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "28");
    expect(screen.getByRole("progressbar").firstElementChild).toHaveStyle({
      transform: "scaleX(0.28)",
    });
    expect(screen.getByRole("link", { name: /Continuar experimento/i })).toHaveAttribute(
      "href",
      "/campaigns?new=1"
    );
  });

  it("shows blocked reason when next action is blocked", () => {
    mockUseProgression.mockReturnValue({
      data: {
        level: {
          key: "aprendiz",
          label: "Aprendiz de Laboratorio",
          shortLabel: "Aprendiz",
          description: "Monte seu laboratorio.",
        },
        progressPercent: 14,
        completed: [{ key: "campaign_created", label: "Primeira campanha", completedAt: "2026-06-06T00:00:00.000Z" }],
        nextAction: {
          key: "readiness_ran",
          label: "Analise de prontidao",
          description: "Rode a analise.",
          href: "/campaigns/abc",
          blocked: true,
          blockedReason: "Envie um criativo base antes.",
        },
        lastCalculatedAt: "2026-06-06T00:00:00.000Z",
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    } as ReturnType<typeof useProgression>);

    render(<AdsScientistProgressCard />);
    expect(screen.getByText("Envie um criativo base antes.")).toBeInTheDocument();
    expect(screen.getByText("Complete o passo anterior")).toBeInTheDocument();
  });
});
