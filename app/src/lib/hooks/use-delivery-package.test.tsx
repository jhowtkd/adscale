import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCreateDeliveryPackage } from "./use-delivery-package";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useCreateDeliveryPackage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ queued: [], readyFormats: ["1:1"] }),
    } as unknown as Response);
  });

  it("posts selected formats to delivery package endpoint", async () => {
    const { result } = renderHook(() => useCreateDeliveryPackage(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      derivationId: "derivation-id",
      formats: ["1:1", "4:5"],
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/derivations/derivation-id/delivery-package",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formats: ["1:1", "4:5"] }),
      }
    );
  });

  it("throws when the endpoint returns an error", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "sourceDerivationNotApproved" }),
    } as unknown as Response);

    const { result } = renderHook(() => useCreateDeliveryPackage(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({
        derivationId: "derivation-id",
        formats: ["4:5"],
      })
    ).rejects.toThrow("sourceDerivationNotApproved");

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
