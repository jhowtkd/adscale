import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OutputLearningRecommendationCard from "./OutputLearningRecommendationCard";

const recordEvent = vi.fn();

vi.mock("@/lib/hooks/use-record-beta-event", () => ({
  useRecordBetaEvent: () => ({ recordEvent }),
}));

vi.mock("@/lib/hooks/use-output-learning-recommendation", () => ({
  outputRecommendationDismissStorageKey: (campaignId: string, id: string) =>
    `output-dismiss:${campaignId}:${id}`,
  useOutputLearningRecommendation: vi.fn(),
}));

import { useOutputLearningRecommendation } from "@/lib/hooks/use-output-learning-recommendation";

const recommendation = {
  id: "rec-1",
  campaignId: "camp-1",
  clientProfileId: "client-1",
  primaryVariableKey: "cta" as const,
  primaryVariableValue: "Comprar agora",
  justification: "Com base em learnings de output",
  confidence: "high" as const,
  confidenceScore: "0.8000",
  sampleEventCount: 5,
  sampleCampaignCount: 2,
  evidence: [
    {
      learningId: "l-1",
      variableKey: "cta",
      variableValue: "Comprar agora",
      statement: "preferir CTA Comprar agora",
      confidence: "high" as const,
      preferenceDirection: "prefer" as const,
      supportingCount: 3,
      contradictingCount: 0,
      scopeGenerationMode: "",
      scopeFormat: "",
    },
  ],
  contradictions: [],
  avoidPatterns: [],
  prefill: {
    recipeId: "performance_push" as const,
    generationMode: "art_variation" as const,
    creativeLevel: "balanced" as const,
    ctaVariants: ["Comprar agora"],
  },
  learningsSource: "postgres" as const,
  algorithmVersion: "1.0.0",
};

describe("OutputLearningRecommendationCard", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("renders recommendation with evidence and actions", () => {
    vi.mocked(useOutputLearningRecommendation).mockReturnValue({
      data: { status: "ready", recommendation },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useOutputLearningRecommendation>);

    const onAccept = vi.fn();
    render(
      <OutputLearningRecommendationCard
        campaignId="camp-1"
        onAccept={onAccept}
        onEdit={vi.fn()}
      />
    );

    expect(screen.getByText(/Aprendizado de output sugerido/)).toBeInTheDocument();
    expect(screen.getByText(/preferir CTA Comprar agora/)).toBeInTheDocument();
    expect(recordEvent).toHaveBeenCalledWith(
      "output_learning_recommendation_viewed",
      expect.objectContaining({ recommendationId: "rec-1" })
    );
  });

  it("accept opens prefill flow", () => {
    vi.mocked(useOutputLearningRecommendation).mockReturnValue({
      data: { status: "ready", recommendation },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useOutputLearningRecommendation>);

    const onAccept = vi.fn();
    render(
      <OutputLearningRecommendationCard
        campaignId="camp-1"
        onAccept={onAccept}
        onEdit={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Aceitar e abrir receita/i }));
    expect(onAccept).toHaveBeenCalledWith({
      recipeId: "performance_push",
      config: expect.objectContaining({ ctaVariants: ["Comprar agora"] }),
    });
  });

  it("returns null when status is insufficient_evidence", () => {
    vi.mocked(useOutputLearningRecommendation).mockReturnValue({
      data: { status: "insufficient_evidence", recommendation: null },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useOutputLearningRecommendation>);

    const { container } = render(
      <OutputLearningRecommendationCard
        campaignId="camp-1"
        onAccept={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
