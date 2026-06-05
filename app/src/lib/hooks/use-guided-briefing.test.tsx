import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useGuidedBriefing } from "./use-guided-briefing";

const mutateAsync = vi.fn().mockResolvedValue({ id: "camp-1" });

vi.mock("next-intl", () => ({
  useLocale: () => "en",
}));

vi.mock("@/lib/hooks/use-campaigns", () => ({
  useUpdateCampaign: () => ({
    mutateAsync,
    isPending: false,
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useGuidedBriefing", () => {
  beforeEach(() => {
    mutateAsync.mockClear();
  });

  it("starts on productOffer for empty answers", () => {
    const { result } = renderHook(
      () => useGuidedBriefing({ campaignId: "camp-1" }),
      { wrapper }
    );
    expect(result.current.currentStep).toBe("productOffer");
    expect(result.current.isComplete).toBe(false);
  });

  it("accepts suggestion and persists draft", async () => {
    const { result } = renderHook(
      () =>
        useGuidedBriefing({
          campaignId: "camp-1",
          hints: { detectedConcept: "Summer shoes" },
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.acceptSuggestion();
    });

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalled();
    });
    expect(result.current.currentStep).toBe("audience");
  });

  it("skips optional step without persist when empty", async () => {
    const { result } = renderHook(
      () =>
        useGuidedBriefing({
          campaignId: "camp-1",
          initialAnswers: {
            product: "App",
            offer: "Trial",
            audience: "SMB",
            promise: "Grow",
            objections: "",
            cta: "Start",
            platforms: "Meta",
          },
        }),
      { wrapper }
    );

    expect(result.current.currentStep).toBe("constraints");

    await act(async () => {
      await result.current.skipStep();
    });

    expect(result.current.isComplete).toBe(true);
  });
});
