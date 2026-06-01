import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useArtVariationSuggestions } from "./use-art-variation-suggestions";

vi.mock("@/lib/hooks/use-assets", () => ({
  useCampaignAssets: vi.fn(() => ({ data: [{ id: "asset-1" }] })),
}));

vi.mock("@/components/campaigns/useCreativeAnalysis", () => ({
  useCreativeAnalysis: vi.fn(() => ({
    analyze: vi.fn().mockResolvedValue({
      analysis: {
        suggestedCreativeLevel: { value: "bold" },
        suggestedCtas: [{ value: "Buy Now" }, { value: "Learn More" }],
      },
    }),
  })),
}));

describe("useArtVariationSuggestions", () => {
  it("prefills manual mode from campaign values", async () => {
    const { result, rerender } = renderHook(
      (props) => useArtVariationSuggestions(props),
      {
        initialProps: {
          campaignId: "camp-1",
          intent: "manual_art" as const,
          open: true,
          campaignCreativeLevel: "conservative",
          campaignCtaVariants: ["CTA A", "CTA B"],
          suggestedCta: "",
        },
      }
    );

    await waitFor(() => {
      expect(result.current.creativeLevel).toBe("conservative");
      expect(result.current.validCtaVariants).toEqual(["CTA A", "CTA B"]);
      expect(result.current.canConfirm).toBe(true);
    });

    rerender({
      campaignId: "camp-1",
      intent: "manual_art",
      open: false,
      campaignCreativeLevel: "conservative",
      campaignCtaVariants: ["CTA A", "CTA B"],
      suggestedCta: "",
    });
  });

  it("loads auto suggestions from analyze hook", async () => {
    const { result } = renderHook(() =>
      useArtVariationSuggestions({
        campaignId: "camp-1",
        intent: "auto_art",
        open: true,
        campaignCreativeLevel: "balanced",
        campaignCtaVariants: null,
        suggestedCta: "Fallback CTA",
      })
    );

    await waitFor(() => {
      expect(result.current.isLoadingSuggestions).toBe(false);
      expect(result.current.creativeLevel).toBe("bold");
      expect(result.current.validCtaVariants).toEqual(["Buy Now", "Learn More"]);
    });
  });
});
