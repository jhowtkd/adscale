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
            access: {
              kind: "paid",
              label: "Assinatura ativa",
              remainingAds: 24,
              beta: null,
            },
            subscription: {
              status: "active",
              planKey: "growth",
              currentPeriodEnd: null,
              cancelAtPeriodEnd: false,
            },
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

  it("parses past_due recovery metadata from billing status", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          billing: {
            hasCustomer: true,
            subscriptionStatus: "past_due",
            access: {
              kind: "paid",
              label: "Pagamento pendente",
              remainingAds: 5,
              hasSpendAccess: true,
              beta: null,
            },
            pastDue: {
              recoveryAction: "portal",
              spendPolicy: "existing_credits_spendable",
            },
            subscription: {
              status: "past_due",
              rawStatus: "past_due",
              planKey: "growth",
              currentPeriodEnd: null,
              cancelAtPeriodEnd: false,
            },
            creditBalance: 25,
          },
        }),
    } as unknown as Response);

    const { result } = renderHook(() => useBillingStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.subscriptionStatus).toBe("past_due");
    expect(result.current.data?.pastDue).toEqual({
      recoveryAction: "portal",
      spendPolicy: "existing_credits_spendable",
    });
    expect(result.current.data?.access.hasSpendAccess).toBe(true);
  });

  it("starts checkout for a selected plan", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: "https://checkout.stripe.com/session" }),
    } as unknown as Response);

    const { result } = renderHook(() => useStartCheckout(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      planKey: "growth",
      returnPath: "/campaigns/c1",
    });

    expect(mockApiFetch).toHaveBeenCalledWith("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planKey: "growth", returnPath: "/campaigns/c1" }),
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

