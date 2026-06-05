import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StrategyRecipePanel from "./StrategyRecipePanel";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (values) {
      return `${key}:${JSON.stringify(values)}`;
    }
    return key;
  },
}));

describe("StrategyRecipePanel", () => {
  it("renders three recipe options and credit estimates", () => {
    const onGeneratePreview = vi.fn();
    render(
      <StrategyRecipePanel
        open
        campaign={{ ctaVariants: ["Shop Now"] }}
        onClose={vi.fn()}
        onOpenAdvanced={vi.fn()}
        onGeneratePreview={onGeneratePreview}
      />
    );

    expect(screen.getByText("recipes.safe_iteration.name")).toBeInTheDocument();
    expect(screen.getByText("recipes.performance_push.name")).toBeInTheDocument();
    expect(screen.getByText("recipes.visual_differentiation.name")).toBeInTheDocument();
    expect(screen.getByText(/creditPreview/)).toBeInTheDocument();
    expect(screen.getByText(/creditBatchEstimate/)).toBeInTheDocument();
  });

  it("calls onGeneratePreview with campaign patch", () => {
    const onGeneratePreview = vi.fn();
    render(
      <StrategyRecipePanel
        open
        campaign={{ ctaVariants: ["Buy"] }}
        onClose={vi.fn()}
        onOpenAdvanced={vi.fn()}
        onGeneratePreview={onGeneratePreview}
      />
    );

    fireEvent.click(screen.getByText("generatePreview"));
    expect(onGeneratePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        generationMode: "art_variation",
        ctaVariants: expect.arrayContaining(["Buy"]),
      })
    );
  });
});
