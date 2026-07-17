import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StrategyRecipePanel from "./StrategyRecipePanel";

const recordEvent = vi.fn();
const strategyRecipeState = vi.hoisted(() => ({
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  lastInput: null as { enabled?: boolean } | null,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (values) {
      return `${key}:${JSON.stringify(values)}`;
    }
    return key;
  },
}));

vi.mock("@/lib/hooks/use-record-beta-event", () => ({
  useRecordBetaEvent: () => ({ recordEvent }),
}));

vi.mock("@/lib/hooks/use-art-variation-suggestions", () => ({
  useArtVariationSuggestions: () => ({
    creativeLevel: "balanced",
    setCreativeLevel: vi.fn(),
    ctas: ["Buy", "", ""],
    updateCta: vi.fn(),
    validCtaVariants: ["Buy"],
    isLoadingSuggestions: false,
    suggestionsError: null,
    retrySuggestions: vi.fn(),
    aiSuggestionsApplied: false,
    highlightedFields: { creativeLevel: false, ctaIndices: [] },
    canConfirm: true,
  }),
}));

vi.mock("@/lib/hooks/use-strategy-recipe", () => ({
  useStrategyRecipe: (input: { enabled?: boolean }) => {
    strategyRecipeState.lastInput = input;
    return ({
    rankedRecipes: [
      { id: "safe_iteration", score: 100, recommended: true },
      { id: "performance_push", score: 50, recommended: false },
      { id: "visual_differentiation", score: 40, recommended: false },
    ],
    selectedRecipeId: "safe_iteration",
    resolvedConfig: {
      generationMode: "art_variation",
      creativeLevel: "conservative",
      ctaVariants: ["Buy"],
      preservationEmphasis: "high",
    },
    overrides: {},
    previewCredits: 5,
    batchCredits: 5,
    selectRecipe: vi.fn(),
    setCreativeLevel: vi.fn(),
    setCtaVariants: vi.fn(),
    setGenerationMode: vi.fn(),
    setTargetFormats: vi.fn(),
    resetOverrides: vi.fn(),
    campaignPatch: {
      generationMode: "art_variation",
      creativeLevel: "conservative",
      ctaVariants: ["Buy"],
    },
    recommendedRecipe: {
      recipeId: "safe_iteration",
      generationMode: "art_variation",
      creativeLevel: "conservative",
      ctaVariants: ["Buy"],
    },
    isLoading: strategyRecipeState.isLoading,
    isError: strategyRecipeState.isError,
    refetch: strategyRecipeState.refetch,
    });
  },
}));

const STAGE_PROPS = { stage: "strategy_recipe", missionKey: "strategy_recipe" };

describe("StrategyRecipePanel", () => {
  beforeEach(() => {
    recordEvent.mockClear();
    strategyRecipeState.isLoading = false;
    strategyRecipeState.isError = false;
    strategyRecipeState.refetch.mockReset();
    strategyRecipeState.lastInput = null;
  });

  it("does not resolve a strategy recipe while the panel is closed", () => {
    render(
      <StrategyRecipePanel
        campaignId="camp-1"
        open={false}
        campaign={{ ctaVariants: ["Buy"] }}
        onClose={vi.fn()}
        onGeneratePreview={vi.fn()}
      />
    );

    expect(strategyRecipeState.lastInput).toMatchObject({ enabled: false });
  });

  it("renders three recipe options", () => {
    const onGeneratePreview = vi.fn();
    render(
      <StrategyRecipePanel
        campaignId="camp-1"
        open
        campaign={{ ctaVariants: ["Shop Now"] }}
        onClose={vi.fn()}
        onGeneratePreview={onGeneratePreview}
      />
    );

    expect(screen.getByText("recipes.safe_iteration.name")).toBeInTheDocument();
    expect(screen.getByText("recipes.performance_push.name")).toBeInTheDocument();
    expect(screen.getByText("recipes.visual_differentiation.name")).toBeInTheDocument();
  });

  it("displays server-derived preview and batch credits", () => {
    render(
      <StrategyRecipePanel
        campaignId="camp-1"
        open
        campaign={{ ctaVariants: ["Buy"] }}
        onClose={vi.fn()}
        onGeneratePreview={vi.fn()}
      />
    );

    expect(screen.getByTestId("strategy-recipe-preview-credits")).toBeInTheDocument();
    expect(screen.getByTestId("strategy-recipe-batch-credits")).toBeInTheDocument();
  });

  it("shows a recoverable error when the server recipe surface fails", () => {
    strategyRecipeState.isError = true;
    render(
      <StrategyRecipePanel
        campaignId="camp-1"
        open
        campaign={{ ctaVariants: ["Buy"] }}
        onClose={vi.fn()}
        onGeneratePreview={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("surfaceError");
    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    expect(strategyRecipeState.refetch).toHaveBeenCalledOnce();
  });

  it("emits cockpit_stage_entered when open", () => {
    render(
      <StrategyRecipePanel
        campaignId="camp-1"
        open
        campaign={{ ctaVariants: ["Buy"] }}
        onClose={vi.fn()}
        onGeneratePreview={vi.fn()}
      />
    );

    expect(recordEvent).toHaveBeenCalledWith("cockpit_stage_entered", STAGE_PROPS);
    expect(recordEvent).toHaveBeenCalledWith("recipe_tradeoff_viewed", STAGE_PROPS);
  });

  it("emits recipe_selected when a recipe is chosen", () => {
    render(
      <StrategyRecipePanel
        campaignId="camp-1"
        open
        campaign={{ ctaVariants: ["Buy"] }}
        onClose={vi.fn()}
        onGeneratePreview={vi.fn()}
      />
    );

    recordEvent.mockClear();
    fireEvent.click(screen.getByText("recipes.safe_iteration.name"));

    expect(recordEvent).toHaveBeenCalledWith("recipe_selected", {
      ...STAGE_PROPS,
      recipeId: "safe_iteration",
    });
  });

  it("emits cockpit_stage_completed and calls onGeneratePreview on success", () => {
    const onGeneratePreview = vi.fn();
    render(
      <StrategyRecipePanel
        campaignId="camp-1"
        open
        campaign={{ ctaVariants: ["Buy"] }}
        onClose={vi.fn()}
        onGeneratePreview={onGeneratePreview}
      />
    );

    recordEvent.mockClear();
    fireEvent.click(screen.getByText("generateVariations"));

    expect(recordEvent).toHaveBeenCalledWith("cockpit_stage_completed", STAGE_PROPS);
    expect(onGeneratePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        generationMode: "art_variation",
        ctaVariants: expect.arrayContaining(["Buy"]),
      })
    );
  });

  it("emits cockpit_stage_abandoned on close without selection", () => {
    const onClose = vi.fn();
    render(
      <StrategyRecipePanel
        campaignId="camp-1"
        open
        campaign={{ ctaVariants: ["Buy"] }}
        onClose={onClose}
        onGeneratePreview={vi.fn()}
      />
    );

    recordEvent.mockClear();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(recordEvent).toHaveBeenCalledWith("cockpit_stage_abandoned", STAGE_PROPS);
    expect(onClose).toHaveBeenCalled();
  });
});
