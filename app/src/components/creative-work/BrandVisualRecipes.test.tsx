import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BrandVisualRecipes } from "./BrandVisualRecipes";
import type { VisualRecipeListItem } from "@/lib/hooks/use-visual-recipes";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => ({ "recipes.title": "Receitas visuais", "recipes.use": "Usar receita" }[key] ?? key),
}));

const recipe = {
  id: "recipe-1",
  version: 2,
  clientProfileId: "brand-a",
  originWorkId: "work-1",
  originOutputId: "out-1",
  document: {
    version: 1,
    format: "4:5",
    layout: "top",
    dimensions: { width: 1080, height: 1350 },
    fontAssetKey: "font-1",
    logo: { referenceId: "logo", assetKey: "logo.png", category: "logo", box: { left: 0, top: 0, width: 10, height: 10 } },
    fixedAssets: [],
    textBoxes: [],
    fields: { headline: "Turma de setembro", body: "Vagas", cta: "Inscreva-se" },
    originWorkId: "work-1",
    originOutputId: "out-1",
  },
} as VisualRecipeListItem;

describe("BrandVisualRecipes", () => {
  it("renders nothing without recipes", () => {
    const { container } = render(<BrandVisualRecipes recipes={[]} onUse={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("uses a brand recipe without mixing another catalog", () => {
    const onUse = vi.fn();
    render(<BrandVisualRecipes recipes={[recipe]} onUse={onUse} />);
    expect(screen.getByText("Turma de setembro")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Usar receita" }));
    expect(onUse).toHaveBeenCalledWith("recipe-1");
  });
});
