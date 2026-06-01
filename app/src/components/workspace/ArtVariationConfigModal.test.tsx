import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ArtVariationConfigModal from "./ArtVariationConfigModal";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    if (namespace === "briefing" && key === "ctaOptional") {
      return `CTA ${values?.number} (optional)`;
    }
    return `${namespace}.${key}`;
  },
}));

vi.mock("@/lib/hooks/use-art-variation-suggestions", () => ({
  useArtVariationSuggestions: vi.fn(),
}));

import { useArtVariationSuggestions } from "@/lib/hooks/use-art-variation-suggestions";

const mockedHook = vi.mocked(useArtVariationSuggestions);

const baseHookReturn = {
  creativeLevel: "balanced" as const,
  setCreativeLevel: vi.fn(),
  ctas: ["Shop Now", "", ""] as [string, string, string],
  updateCta: vi.fn(),
  validCtaVariants: ["Shop Now"],
  isLoadingSuggestions: false,
  suggestionsError: null,
  retrySuggestions: vi.fn(),
  aiSuggestionsApplied: false,
  highlightedFields: { creativeLevel: false, ctaIndices: [] },
  canConfirm: true,
};

describe("ArtVariationConfigModal", () => {
  beforeEach(() => {
    mockedHook.mockReturnValue(baseHookReturn);
  });

  it("disables confirm when no valid CTAs", () => {
    mockedHook.mockReturnValue({
      ...baseHookReturn,
      ctas: ["", "", ""],
      validCtaVariants: [],
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

  it("disables confirm while auto suggestions are loading", () => {
    mockedHook.mockReturnValue({
      ...baseHookReturn,
      isLoadingSuggestions: true,
      canConfirm: false,
    });

    render(
      <ArtVariationConfigModal
        open
        intent="auto_art"
        campaignId="camp-1"
        onBack={vi.fn()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "workspace.derivar.actions.confirm" })).toBeDisabled();
    expect(screen.getByText("generation.generatingSuggestions")).toBeInTheDocument();
  });

  it("shows error alert with retry when suggestions fail", () => {
    const retrySuggestions = vi.fn();
    mockedHook.mockReturnValue({
      ...baseHookReturn,
      suggestionsError: "Network error",
      retrySuggestions,
      canConfirm: true,
    });

    render(
      <ArtVariationConfigModal
        open
        intent="auto_art"
        campaignId="camp-1"
        onBack={vi.fn()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("workspace.derivar.config.autoArt.suggestionsFailed")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "workspace.derivar.config.autoArt.retrySuggestions" })
    );
    expect(retrySuggestions).toHaveBeenCalled();
  });

  it("does not render cancel button in footer", () => {
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

    expect(screen.queryByRole("button", { name: "workspace.derivar.actions.cancel" })).not.toBeInTheDocument();
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

  it("exposes creative level as a radiogroup", () => {
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

    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByRole("radio", { checked: true })).toBeInTheDocument();
  });
});
