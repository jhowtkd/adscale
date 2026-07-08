import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StrategyRecipePanel from "./StrategyRecipePanel";

const recordEvent = vi.fn();

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

const STAGE_PROPS = { stage: "strategy_recipe", missionKey: "strategy_recipe" };

describe("StrategyRecipePanel", () => {
  beforeEach(() => {
    recordEvent.mockClear();
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

  it("does not display credit cost before execution", () => {
    render(
      <StrategyRecipePanel
        campaignId="camp-1"
        open
        campaign={{ ctaVariants: ["Buy"] }}
        onClose={vi.fn()}
        onGeneratePreview={vi.fn()}
      />
    );

    expect(screen.queryByText(/creditPreview/)).not.toBeInTheDocument();
    expect(screen.queryByText(/creditBatchEstimate/)).not.toBeInTheDocument();
    expect(screen.queryByText(/créditos/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/credits/i)).not.toBeInTheDocument();
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
