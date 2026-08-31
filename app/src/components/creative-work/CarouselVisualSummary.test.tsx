import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CarouselVisualContractV1 } from "@/server/creative-work/carousel-contracts";
import { CarouselVisualSummary } from "./CarouselVisualSummary";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (key === "temporaryReferenceWith") return `Referência temporária ${values?.id}`;
    return ({
      visualTitle: "Sistema visual",
      paletteLabel: "Paleta",
      typographyLabel: "Tipografia",
      fontApproved: "Fonte da marca aplicada",
      fontFallback: "Fonte da marca indisponível; o sistema usa uma fonte segura (sans).",
      motifsLabel: "Elementos recorrentes",
      layoutFamiliesLabel: "Famílias de composição",
      layout_impact: "Impacto",
      layout_development: "Desenvolvimento",
      layout_respite: "Respiro",
      density_high: "Alta", density_medium: "Média", density_low: "Baixa",
      prohibitedLabel: "Evitar",
      exactAssetsLabel: "Ativos exatos",
      exactAssetsEmpty: "Nenhum ativo exato nesta composição.",
      temporaryReferenceWithout: "Nenhuma referência temporária está em uso neste carrossel.",
    }[key] ?? key);
  },
}));

function visualContract(overrides: Partial<CarouselVisualContractV1> = {}): CarouselVisualContractV1 {
  return {
    version: 1,
    brandSnapshotHash: "hash-1",
    temporaryReferenceId: "ref-temp-1",
    palette: ["#101828", "#FFFFFF", "#2563EB"],
    typography: { fontAssetKey: "font-1", fallbackFamily: null, authority: "approved" },
    directionInstruction: "Manter contraste alto",
    layoutFamilies: {
      impact: {
        id: "impact", density: "high",
        primaryRegion: { x: 0, y: 0, width: 100, height: 40, minFontPx: 24, maxFontPx: 64, align: "left" },
        secondaryRegion: null, exactAssetSlots: [], backgroundInstruction: "fundo sólido",
      },
      development: {
        id: "development", density: "medium",
        primaryRegion: { x: 0, y: 0, width: 100, height: 30, minFontPx: 18, maxFontPx: 40, align: "left" },
        secondaryRegion: null, exactAssetSlots: [], backgroundInstruction: "textura leve",
      },
      respite: {
        id: "respite", density: "low",
        primaryRegion: { x: 0, y: 0, width: 100, height: 20, minFontPx: 16, maxFontPx: 32, align: "center" },
        secondaryRegion: null, exactAssetSlots: [], backgroundInstruction: "respiro",
      },
    },
    recurringMotifs: ["faixa diagonal", "grade sutil"],
    exactAssetKeys: ["logo-horizontal"],
    prohibitedElements: ["texto dentro da imagem", "mão gerada"],
    safeAreaPx: 48,
    contractHash: "a".repeat(64),
    ...overrides,
  };
}

describe("CarouselVisualSummary", () => {
  it("renders the frozen palette, motifs, three layout families, prohibitions and exact assets", () => {
    render(<CarouselVisualSummary visualContract={visualContract()} />);

    expect(screen.getByRole("heading", { name: "Sistema visual" })).toBeInTheDocument();
    for (const color of ["#101828", "#FFFFFF", "#2563EB"]) {
      expect(screen.getByTitle(color)).toBeInTheDocument();
    }
    const motifs = screen.getByTestId("carousel-visual-motifs");
    expect(motifs).toHaveTextContent("faixa diagonal");
    expect(motifs).toHaveTextContent("grade sutil");

    const families = screen.getByTestId("carousel-visual-families");
    expect(families).toHaveTextContent("Impacto");
    expect(families).toHaveTextContent("Desenvolvimento");
    expect(families).toHaveTextContent("Respiro");

    expect(screen.getByTestId("carousel-visual-prohibitions")).toHaveTextContent("texto dentro da imagem");
    expect(screen.getByTestId("carousel-visual-exact-assets")).toHaveTextContent("logo-horizontal");
  });

  it("states the font authority and the sans fallback limitation", () => {
    const { rerender } = render(<CarouselVisualSummary visualContract={visualContract()} />);
    expect(screen.getByTestId("carousel-visual-typography")).toHaveTextContent("Fonte da marca aplicada");

    rerender(
      <CarouselVisualSummary
        visualContract={visualContract({ typography: { fontAssetKey: null, fallbackFamily: "sans", authority: "fallback" } })}
      />,
    );
    expect(screen.getByTestId("carousel-visual-typography")).toHaveTextContent(
      "Fonte da marca indisponível; o sistema usa uma fonte segura (sans).",
    );
  });

  it("states the temporary reference scope and its absence", () => {
    const { rerender } = render(<CarouselVisualSummary visualContract={visualContract()} />);
    expect(screen.getByTestId("carousel-visual-temporary")).toHaveTextContent("Referência temporária ref-temp-1");

    rerender(<CarouselVisualSummary visualContract={visualContract({ temporaryReferenceId: null })} />);
    expect(screen.getByTestId("carousel-visual-temporary")).toHaveTextContent(
      "Nenhuma referência temporária está em uso neste carrossel.",
    );
  });

  it("renders nothing without a frozen contract", () => {
    const { container } = render(<CarouselVisualSummary visualContract={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
