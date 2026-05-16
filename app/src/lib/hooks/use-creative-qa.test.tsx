import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCreativeQa } from "./use-creative-qa";

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

describe("useCreativeQa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to /api/derivations/:id/qa", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ qa: { status: "ready" } }),
    } as unknown as Response);

    const { result } = renderHook(() => useCreativeQa(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({ derivationId: "derivation-id" });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/derivations/derivation-id/qa",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  it("throws on non-ok response", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "derivationNotApprovedForQa" }),
    } as unknown as Response);

    const { result } = renderHook(() => useCreativeQa(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({ derivationId: "derivation-id" })
    ).rejects.toThrow("derivationNotApprovedForQa");

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it("invalidates derivations and campaigns after success", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ qa: { status: "ready" } }),
    } as unknown as Response);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreativeQa(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({ derivationId: "derivation-id" });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["derivations"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["campaigns"] });
  });
});
