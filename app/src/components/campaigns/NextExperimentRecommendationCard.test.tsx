import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import NextExperimentRecommendationCard from "./NextExperimentRecommendationCard";

const recordEvent = vi.fn();

vi.mock("@/lib/hooks/use-record-beta-event", () => ({
  useRecordBetaEvent: () => ({ recordEvent }),
}));

vi.mock("@/lib/hooks/use-next-experiment-recommendation", () => ({
  recommendationDismissStorageKey: (campaignId: string, id: string) =>
    `dismiss:${campaignId}:${id}`,
  useNextExperimentRecommendation: vi.fn(),
}));

import { useNextExperimentRecommendation } from "@/lib/hooks/use-next-experiment-recommendation";

const recommendation = {
  id: "rec-1",
  campaignId: "campaign-1",
  clientProfileId: "client-1",
  primaryVariableKey: "cta" as const,
  primaryVariableValue: "Comprar agora",
  justification: "Recomendamos testar este CTA.",
  confidence: "high" as const,
  confidenceScore: "0.8000",
  sampleImpressions: 5000,
  sampleCampaignCount: 2,
  evidence: [
    {
      learningId: "learning-1",
      variableKey: "cta",
      variableValue: "Comprar agora",
      statement: "CTA tende a aumentar CTR",
      confidence: "high" as const,
      supportingCount: 2,
      contradictingCount: 0,
    },
  ],
  contradictions: [],
  prefill: {
    recipeId: "performance_push" as const,
    generationMode: "art_variation" as const,
    creativeLevel: "bold" as const,
    ctaVariants: ["Comprar agora"],
  },
  learningsSource: "postgres" as const,
  algorithmVersion: "1.0.0",
};

describe("NextExperimentRecommendationCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("renders recommendation with evidence and actions", () => {
    vi.mocked(useNextExperimentRecommendation).mockReturnValue({
      data: { status: "ready", recommendation },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useNextExperimentRecommendation>);

    const onAccept = vi.fn();
    const onEdit = vi.fn();

    render(
      <NextExperimentRecommendationCard
        campaignId="campaign-1"
        onAccept={onAccept}
        onEdit={onEdit}
      />
    );

    expect(screen.getByText(/Próximo experimento sugerido/)).toBeInTheDocument();
    expect(screen.getByText(/CTA tende a aumentar CTR/)).toBeInTheDocument();
    expect(recordEvent).toHaveBeenCalledWith(
      "next_experiment_viewed",
      expect.objectContaining({ recommendationId: "rec-1" })
    );
  });

  it("accept opens prefill flow and records analytics", () => {
    vi.mocked(useNextExperimentRecommendation).mockReturnValue({
      data: { status: "ready", recommendation },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useNextExperimentRecommendation>);

    const onAccept = vi.fn();

    render(
      <NextExperimentRecommendationCard
        campaignId="campaign-1"
        onAccept={onAccept}
        onEdit={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Aceitar e abrir receita/ }));

    expect(onAccept).toHaveBeenCalledWith({
      recipeId: "performance_push",
      config: expect.objectContaining({
        ctaVariants: ["Comprar agora"],
      }),
    });
    expect(recordEvent).toHaveBeenCalledWith(
      "next_experiment_accepted",
      expect.objectContaining({ recommendationId: "rec-1" })
    );
  });

  it("dismiss hides card and persists in session storage", () => {
    vi.mocked(useNextExperimentRecommendation).mockReturnValue({
      data: { status: "ready", recommendation },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useNextExperimentRecommendation>);

    const { rerender } = render(
      <NextExperimentRecommendationCard
        campaignId="campaign-1"
        onAccept={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Ignorar/ }));
    expect(screen.queryByText(/Próximo experimento sugerido/)).not.toBeInTheDocument();

    rerender(
      <NextExperimentRecommendationCard
        campaignId="campaign-1"
        onAccept={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    expect(screen.queryByText(/Próximo experimento sugerido/)).not.toBeInTheDocument();
  });
});
