import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAnalyzePreflight, usePreflightScore } from "./use-preflight";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

const sampleResponse = {
  preflight: { overallScore: 82 },
  readiness: {
    overallScore: 82,
    status: "ready",
    canGenerate: true,
  },
  status: "completed",
};

function createWrapper(queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("usePreflightScore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads readiness from GET preflight endpoint", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleResponse),
    } as unknown as Response);

    const { result } = renderHook(() => usePreflightScore("asset-1", "camp-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.readiness?.status).toBe("ready");
    expect(mockApiFetch).toHaveBeenCalledWith("/api/campaigns/camp-1/assets/asset-1/preflight");
  });
});

describe("useAnalyzePreflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to preflight endpoint with force body when rerun requested", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleResponse),
    } as unknown as Response);

    const { result } = renderHook(() => useAnalyzePreflight(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      campaignId: "camp-1",
      assetId: "asset-1",
      force: true,
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/campaigns/camp-1/assets/asset-1/preflight",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ force: true }),
      })
    );
  });

  it("invalidates preflight and campaign assets after success", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleResponse),
    } as unknown as Response);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useAnalyzePreflight(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      campaignId: "camp-1",
      assetId: "asset-1",
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["preflight", "camp-1", "asset-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["campaign-assets", "camp-1"],
    });
  });
});
