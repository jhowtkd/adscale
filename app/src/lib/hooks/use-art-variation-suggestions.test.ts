import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useArtVariationSuggestions } from "./use-art-variation-suggestions";

const mockAnalyze = vi.fn();

vi.mock("@/lib/hooks/use-assets", () => ({
  useCampaignAssets: vi.fn(() => ({ data: [{ id: "asset-1" }] })),
}));

vi.mock("@/components/campaigns/useCreativeAnalysis", () => ({
  useCreativeAnalysis: vi.fn(() => ({
    analyze: (...args: unknown[]) => mockAnalyze(...args),
  })),
}));

describe("useArtVariationSuggestions", () => {
  beforeEach(() => {
    mockAnalyze.mockReset();
    mockAnalyze.mockResolvedValue({
      analysis: {
        suggestedCreativeLevel: { value: "bold" },
        suggestedCtas: [{ value: "Buy Now" }, { value: "Learn More" }],
      },
      status: "completed",
    });
  });

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
      expect(result.current.aiSuggestionsApplied).toBe(true);
      expect(result.current.suggestionsError).toBeNull();
    });
  });

  it("exposes suggestionsError and retrySuggestions when analyze throws", async () => {
    mockAnalyze.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() =>
      useArtVariationSuggestions({
        campaignId: "camp-1",
        intent: "auto_art",
        open: true,
        campaignCreativeLevel: "conservative",
        campaignCtaVariants: ["Campaign CTA"],
        suggestedCta: "",
      })
    );

    await waitFor(() => {
      expect(result.current.isLoadingSuggestions).toBe(false);
      expect(result.current.suggestionsError).toBe("Network error");
      expect(result.current.aiSuggestionsApplied).toBe(false);
      expect(result.current.creativeLevel).toBe("conservative");
      expect(result.current.validCtaVariants).toEqual(["Campaign CTA"]);
    });

    mockAnalyze.mockResolvedValueOnce({
      analysis: {
        suggestedCreativeLevel: { value: "bold" },
        suggestedCtas: [{ value: "Retry CTA" }],
      },
      status: "completed",
    });

    await act(async () => {
      result.current.retrySuggestions();
    });

    await waitFor(() => {
      expect(result.current.suggestionsError).toBeNull();
      expect(result.current.aiSuggestionsApplied).toBe(true);
      expect(result.current.validCtaVariants).toEqual(["Retry CTA"]);
    });
  });

  it("sets suggestionsError when analyze returns failed status", async () => {
    mockAnalyze.mockResolvedValueOnce({
      analysis: {},
      status: "failed",
      message: "Analysis unavailable",
    });

    const { result } = renderHook(() =>
      useArtVariationSuggestions({
        campaignId: "camp-1",
        intent: "auto_art",
        open: true,
        campaignCreativeLevel: "balanced",
        campaignCtaVariants: ["Default CTA"],
        suggestedCta: "",
      })
    );

    await waitFor(() => {
      expect(result.current.suggestionsError).toBe("Analysis unavailable");
      expect(result.current.aiSuggestionsApplied).toBe(false);
      expect(result.current.validCtaVariants).toEqual(["Default CTA"]);
    });
  });
});
