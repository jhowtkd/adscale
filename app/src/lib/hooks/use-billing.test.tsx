import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useBillingPortal,
  useBillingStatus,
  useCreditHistory,
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

  it("parses canceled recovery metadata from billing status", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          billing: {
            hasCustomer: true,
            subscriptionStatus: "canceled",
            access: {
              kind: "none",
              label: "Sem acesso ativo",
              remainingAds: null,
              hasSpendAccess: false,
              beta: null,
            },
            pastDue: null,
            canceled: { recoveryAction: "checkout" },
            subscription: {
              status: "canceled",
              rawStatus: "canceled",
              planKey: "growth",
              currentPeriodEnd: "2026-05-01T00:00:00.000Z",
              cancelAtPeriodEnd: false,
            },
            creditBalance: 0,
          },
        }),
    } as unknown as Response);

    const { result } = renderHook(() => useBillingStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.canceled).toEqual({ recoveryAction: "checkout" });
  });

  it("fetches grant history from billing history endpoint", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          grants: [
            {
              id: "grant-1",
              source: "stripe_invoice",
              amount: 120,
              remaining: 80,
              createdAt: "2026-05-01T12:00:00.000Z",
            },
          ],
          transactions: [],
          summary: {
            totalSpent: 0,
            remainingCredits: 80,
            averagePerCampaign: 0,
            transactionCount: 0,
          },
          campaigns: [],
        }),
    } as unknown as Response);

    const { result } = renderHook(() => useCreditHistory(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.grants[0]).toEqual({
      id: "grant-1",
      source: "stripe_invoice",
      amount: 120,
      remaining: 80,
      createdAt: "2026-05-01T12:00:00.000Z",
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

  it("when status reports pending trial, queries POST /api/billing/trial/activate once and refetches status", async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            billing: {
              hasCustomer: false,
              subscriptionStatus: "none",
              access: {
                kind: "none",
                label: "Sem acesso ativo",
                remainingAds: null,
                hasSpendAccess: false,
                beta: null,
                trial: { status: "pending_verification" },
              },
              pastDue: null,
              canceled: null,
              subscription: null,
              creditBalance: 0,
            },
          }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: "activated",
            entitlement: { id: "ent-1", status: "active" },
            grant: { id: "grant-1", amount: 500 },
          }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            billing: {
              hasCustomer: false,
              subscriptionStatus: "none",
              access: {
                kind: "trial",
                label: "Trial",
                remainingAds: 10,
                hasSpendAccess: true,
                beta: null,
                trial: { status: "active" },
              },
              pastDue: null,
              canceled: null,
              subscription: null,
              creditBalance: 500,
            },
          }),
      } as unknown as Response);

    const { result } = renderHook(() => useBillingStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApiFetch).toHaveBeenNthCalledWith(1, "/api/billing/status");
    expect(mockApiFetch).toHaveBeenNthCalledWith(2, "/api/billing/trial/activate", {
      method: "POST",
    });
    expect(mockApiFetch).toHaveBeenNthCalledWith(3, "/api/billing/status");

    expect(result.current.data?.access.kind).toBe("trial");
    expect(result.current.data?.access.trial?.status).toBe("active");
    expect(result.current.data?.creditBalance).toBe(500);
  });

  it("when trial activation fails, surfaces as a temporary billing query error rather than none access", async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            billing: {
              hasCustomer: false,
              subscriptionStatus: "none",
              access: {
                kind: "none",
                label: "Sem acesso ativo",
                remainingAds: null,
                hasSpendAccess: false,
                beta: null,
                trial: { status: "pending_verification" },
              },
              pastDue: null,
              canceled: null,
              subscription: null,
              creditBalance: 0,
            },
          }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () =>
          Promise.resolve({
            error: "Email unverified",
            code: "email_unverified",
          }),
      } as unknown as Response);

    const { result } = renderHook(() => useBillingStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.data).toBeUndefined();
    expect(mockApiFetch).toHaveBeenNthCalledWith(1, "/api/billing/status");
    expect(mockApiFetch).toHaveBeenNthCalledWith(2, "/api/billing/trial/activate", {
      method: "POST",
    });
  });
});
