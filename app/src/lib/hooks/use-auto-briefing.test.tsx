import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAutoBriefing } from "./use-auto-briefing";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

function createWrapper(queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useAutoBriefing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts imageKey to /api/campaigns/:id/auto-briefing", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          extracted: {
            client: "Acme",
            product: "Widget",
            offer: "20% off",
            objective: "Drive sales",
            audience: "Tech enthusiasts",
            ctaText: "Buy now",
            constraints: "",
          },
          confidence: {
            client: 0.85,
            offer: 0.8,
            ctaText: 0.9,
            audience: 0.6,
          },
        }),
    } as unknown as Response);

    const { result } = renderHook(() => useAutoBriefing("camp-1"), {
      wrapper: createWrapper(),
    });

    const data = await result.current.mutateAsync("assets/image.png");

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/campaigns/camp-1/auto-briefing",
      {
        method: "POST",
        body: JSON.stringify({ imageKey: "assets/image.png" }),
      }
    );

    expect(data.extracted.client).toBe("Acme");
    expect(data.confidence.client).toBe(0.85);
  });

  it("throws on non-ok response", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "analysisFailed" }),
    } as unknown as Response);

    const { result } = renderHook(() => useAutoBriefing("camp-1"), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync("assets/image.png")
    ).rejects.toThrow("analysisFailed");

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it("throws generic error when response body has no error field", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    } as unknown as Response);

    const { result } = renderHook(() => useAutoBriefing("camp-1"), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync("assets/image.png")
    ).rejects.toThrow("Auto-briefing analysis failed");
  });
});
