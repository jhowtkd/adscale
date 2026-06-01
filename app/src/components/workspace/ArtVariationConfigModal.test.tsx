import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ArtVariationConfigModal from "./ArtVariationConfigModal";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    if (namespace === "briefing" && key === "ctaPiece") {
      return `CTA ${values?.number}`;
    }
    return `${namespace}.${key}`;
  },
}));

vi.mock("@/lib/hooks/use-art-variation-suggestions", () => ({
  useArtVariationSuggestions: vi.fn(),
}));

import { useArtVariationSuggestions } from "@/lib/hooks/use-art-variation-suggestions";

const mockedHook = vi.mocked(useArtVariationSuggestions);

describe("ArtVariationConfigModal", () => {
  beforeEach(() => {
    mockedHook.mockReturnValue({
      creativeLevel: "balanced",
      setCreativeLevel: vi.fn(),
      ctas: ["Shop Now", "", ""],
      updateCta: vi.fn(),
      validCtaVariants: ["Shop Now"],
      isLoadingSuggestions: false,
      canConfirm: true,
    });
  });

  it("disables confirm when no valid CTAs", () => {
    mockedHook.mockReturnValue({
      creativeLevel: "balanced",
      setCreativeLevel: vi.fn(),
      ctas: ["", "", ""],
      updateCta: vi.fn(),
      validCtaVariants: [],
      isLoadingSuggestions: false,
      canConfirm: false,
    });

    render(
      <ArtVariationConfigModal
        open
        intent="manual_art"
        campaignId="camp-1"
        onBack={vi.fn()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "workspace.derivar.actions.confirm" })).toBeDisabled();
  });

  it("calls onConfirm with creativeLevel and trimmed CTAs", async () => {
    const onConfirm = vi.fn();
    render(
      <ArtVariationConfigModal
        open
        intent="manual_art"
        campaignId="camp-1"
        onBack={vi.fn()}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "workspace.derivar.actions.confirm" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith({
        creativeLevel: "balanced",
        ctaVariants: ["Shop Now"],
      });
    });
  });
});
