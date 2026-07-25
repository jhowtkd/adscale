import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OutputLearningRecommendationCard from "./OutputLearningRecommendationCard";

const recordEvent = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, vars?: Record<string, string>) => {
    if (ns === "campaigns.learnings.confidence") {
      const levels: Record<string, string> = { high: "Alta", medium: "Média", low: "Baixa" };
      return levels[key] ?? key;
    }
    const map: Record<string, string> = {
      loading: "Carregando recomendação de output learning…",
      eyebrow: "Aprendizado de output sugerido",
      "titles.cta": `Testar CTA "${vars?.value ?? ""}"`,
      confidence: `Confiança ${vars?.level ?? ""}`,
      accept: "Aceitar e abrir receita",
    };
    return map[key] ?? key;
  },
  useLocale: () => "pt-BR",
}));

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
  appliedLearningTrace: {
    traceId: "ol-trace-1",
    learningsSource: "postgres" as const,
    safetyVersion: "1.0.0",
    algorithmVersion: "1.0.0",
    entries: [
      {
        learningId: "l-1",
        variableKey: "cta",
        variableValue: "Comprar agora",
        preferenceDirection: "prefer" as const,
        applied: true,
        evidenceEventIds: ["evt-1"],
      },
    ],
    blockedFields: [],
    avoidPatternHints: [],
  },
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
      prefill: {
        recipeId: "performance_push",
        config: expect.objectContaining({ ctaVariants: ["Comprar agora"] }),
      },
      applicationSnapshot: expect.objectContaining({
        applied: true,
        resolution: "recorded",
        traceId: "ol-trace-1",
      }),
    });
  });

  it("accept records output_learning_recommendation_accepted with trace properties and still fires onAccept", () => {
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

    expect(recordEvent).toHaveBeenCalledWith(
      "output_learning_recommendation_accepted",
      expect.objectContaining({
        recommendationId: "rec-1",
        variableKey: "cta",
        confidence: "high",
        recipeId: "performance_push",
        action: "accept",
        traceId: "ol-trace-1",
        evidenceEventCount: 1,
        blockedFieldCount: 0,
      })
    );
    // Fire-and-forget telemetry must not block the local action.
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("edit records output_learning_recommendation_edited and still fires onEdit", () => {
    vi.mocked(useOutputLearningRecommendation).mockReturnValue({
      data: { status: "ready", recommendation },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useOutputLearningRecommendation>);

    const onEdit = vi.fn();
    render(
      <OutputLearningRecommendationCard
        campaignId="camp-1"
        onAccept={vi.fn()}
        onEdit={onEdit}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "edit" }));

    expect(recordEvent).toHaveBeenCalledWith(
      "output_learning_recommendation_edited",
      expect.objectContaining({
        recommendationId: "rec-1",
        variableKey: "cta",
        confidence: "high",
        recipeId: "performance_push",
        action: "edit",
      })
    );
    expect(onEdit).toHaveBeenCalledWith({
      recipeId: "performance_push",
      config: expect.objectContaining({ ctaVariants: ["Comprar agora"] }),
    });
  });

  it("dismiss records output_learning_recommendation_dismissed and hides the card locally", () => {
    vi.mocked(useOutputLearningRecommendation).mockReturnValue({
      data: { status: "ready", recommendation },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useOutputLearningRecommendation>);

    render(
      <OutputLearningRecommendationCard
        campaignId="camp-1"
        onAccept={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "dismiss" }));

    expect(recordEvent).toHaveBeenCalledWith(
      "output_learning_recommendation_dismissed",
      expect.objectContaining({
        recommendationId: "rec-1",
        variableKey: "cta",
        confidence: "high",
        reasonCode: "user_dismissed",
      })
    );
    expect(
      screen.queryByText(/Aprendizado de output sugerido/)
    ).not.toBeInTheDocument();
    expect(
      sessionStorage.getItem("output-dismiss:camp-1:rec-1")
    ).toBe("1");
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
