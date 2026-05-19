import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useBillingPortal,
  useBillingStatus,
  useStartCheckout,
} from "./use-billing";

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

describe("billing hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.href = "http://localhost/";
  });

  it("fetches billing status", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          billing: {
            hasCustomer: true,
            subscription: { status: "active", planKey: "growth" },
            creditBalance: 120,
          },
        }),
    } as unknown as Response);

    const { result } = renderHook(() => useBillingStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApiFetch).toHaveBeenCalledWith("/api/billing/status");
    expect(result.current.data?.creditBalance).toBe(120);
  });

  it("starts checkout for a selected plan", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: "https://checkout.stripe.com/session" }),
    } as unknown as Response);

    const { result } = renderHook(() => useStartCheckout(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync("growth");

    expect(mockApiFetch).toHaveBeenCalledWith("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planKey: "growth" }),
    });
  });

  it("opens the billing portal", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: "https://billing.stripe.com/session" }),
    } as unknown as Response);

    const { result } = renderHook(() => useBillingPortal(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync();

    expect(mockApiFetch).toHaveBeenCalledWith("/api/billing/portal", {
      method: "POST",
    });
  });
});

