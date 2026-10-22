import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useBillingPortal,
  useBillingStatus,
  useCreditGrants,
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

  describe("credit history (keyset pages)", () => {
    const summary = { totalSpent: 9, remainingCredits: 80, averagePerCampaign: 3, transactionCount: 4 };
    const usageSeries = [{ date: "2026-10-01", amount: 9 }];
    const campaigns = [{ id: "camp-1", name: "A" }];
    const tx = (id: string) => ({
      id,
      userId: "u",
      workspaceId: "w",
      campaignId: null,
      campaignName: null,
      derivationId: null,
      amount: -1,
      type: "usage",
      description: null,
      createdAt: "2026-10-01T10:00:00.000Z",
    });
    const ok = (body: unknown) => ({ ok: true, json: () => Promise.resolve(body) }) as unknown as Response;
    const urlOf = (call: number) => new URL(String(mockApiFetch.mock.calls[call][0]));

    function twoPages() {
      mockApiFetch.mockImplementation(async (input) => {
        const cursor = new URL(String(input)).searchParams.get("cursor");
        return cursor
          ? ok({ transactions: [tx("t3")], nextCursor: null })
          : ok({ transactions: [tx("t1"), tx("t2")], nextCursor: "cursor-1", summary, usageSeries, campaigns });
      });
    }

    it("fetches the first page without a cursor and exposes summary, series and campaigns", async () => {
      twoPages();
      const { result } = renderHook(() => useCreditHistory({ from: "2026-10-01T00:00:00.000Z" }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockApiFetch).toHaveBeenCalledTimes(1);
      expect(urlOf(0).pathname).toBe("/api/billing/history");
      expect(urlOf(0).searchParams.get("cursor")).toBeNull();
      expect(urlOf(0).searchParams.get("from")).toBe("2026-10-01T00:00:00.000Z");
      expect(result.current.data?.transactions.map((t) => t.id)).toEqual(["t1", "t2"]);
      expect(result.current.data?.summary).toEqual(summary);
      expect(result.current.data?.usageSeries).toEqual(usageSeries);
      expect(result.current.data?.campaigns).toEqual(campaigns);
      expect(result.current.hasNextPage).toBe(true);
    });

    it("fetchNextPage sends the cursor with the same filters and flattens the pages", async () => {
      twoPages();
      const params = { from: "2026-10-01T00:00:00.000Z", to: "2026-10-31T23:59:59.999Z", campaignId: "camp-1" };
      const { result } = renderHook(() => useCreditHistory(params), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      // Reading `data` and `hasNextPage` first makes the observer track them (react-query tracks used props).
      expect(result.current.data?.transactions).toHaveLength(2);
      expect(result.current.hasNextPage).toBe(true);

      await act(async () => {
        await result.current.fetchNextPage();
      });

      await waitFor(() => expect(result.current.data?.transactions).toHaveLength(3));
      expect(mockApiFetch).toHaveBeenCalledTimes(2);
      const second = urlOf(1);
      expect(second.searchParams.get("cursor")).toBe("cursor-1");
      expect(second.searchParams.get("from")).toBe(params.from);
      expect(second.searchParams.get("to")).toBe(params.to);
      expect(second.searchParams.get("campaignId")).toBe("camp-1");
      expect(result.current.data?.transactions.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
      // Totals still come from page 1.
      expect(result.current.data?.summary).toEqual(summary);
      expect(result.current.data?.usageSeries).toEqual(usageSeries);
      expect(result.current.hasNextPage).toBe(false);
    });

    it("has no next page when nextCursor is null", async () => {
      mockApiFetch.mockResolvedValue(ok({ transactions: [tx("t1")], nextCursor: null, summary, usageSeries, campaigns }));
      const { result } = renderHook(() => useCreditHistory(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.hasNextPage).toBe(false);
    });

    it("new params start a fresh fetch without a cursor", async () => {
      twoPages();
      const { result, rerender } = renderHook(({ campaignId }) => useCreditHistory({ campaignId }), {
        wrapper: createWrapper(),
        initialProps: { campaignId: undefined as string | undefined },
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      await act(async () => {
        await result.current.fetchNextPage();
      });
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));

      rerender({ campaignId: "camp-1" });

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(3));
      const fresh = urlOf(2);
      expect(fresh.searchParams.get("campaignId")).toBe("camp-1");
      expect(fresh.searchParams.get("cursor")).toBeNull();
      await waitFor(() => expect(result.current.data?.transactions.map((t) => t.id)).toEqual(["t1", "t2"]));
    });
  });

  describe("credit grants (view=grants)", () => {
    const grant = (id: string) => ({ id, source: "stripe_invoice", amount: 120, remaining: 80, createdAt: "2026-05-01T12:00:00.000Z" });

    it("requests view=grants and chains the cursor", async () => {
      mockApiFetch.mockImplementation(async (input) => {
        const cursor = new URL(String(input)).searchParams.get("cursor");
        return {
          ok: true,
          json: () =>
            Promise.resolve(
              cursor ? { grants: [grant("g2")], nextCursor: null } : { grants: [grant("g1")], nextCursor: "gc-1" }
            ),
        } as unknown as Response;
      });

      const { result } = renderHook(() => useCreditGrants(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const first = new URL(String(mockApiFetch.mock.calls[0][0]));
      expect(first.searchParams.get("view")).toBe("grants");
      expect(first.searchParams.get("cursor")).toBeNull();
      expect(result.current.data).toEqual([grant("g1")]);
      expect(result.current.hasNextPage).toBe(true);

      await act(async () => {
        await result.current.fetchNextPage();
      });

      await waitFor(() => expect(result.current.data).toHaveLength(2));
      const second = new URL(String(mockApiFetch.mock.calls[1][0]));
      expect(second.searchParams.get("view")).toBe("grants");
      expect(second.searchParams.get("cursor")).toBe("gc-1");
      expect(result.current.data?.map((g) => g.id)).toEqual(["g1", "g2"]);
      expect(result.current.hasNextPage).toBe(false);
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

  it("parses the unlimited access flag from billing status", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          billing: {
            hasCustomer: false,
            subscriptionStatus: "active",
            access: {
              kind: "tester",
              label: "Tester",
              remainingAds: null,
              hasSpendAccess: true,
              beta: null,
              unlimited: true,
            },
            pastDue: null,
            canceled: null,
            subscription: null,
            creditBalance: 999999,
          },
        }),
    } as unknown as Response);

    const { result } = renderHook(() => useBillingStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.access.unlimited).toBe(true);
  });

  it("treats a missing unlimited flag as limited access", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          billing: {
            hasCustomer: true,
            subscriptionStatus: "active",
            access: {
              kind: "paid",
              label: "Assinatura ativa",
              remainingAds: 24,
              hasSpendAccess: true,
              beta: null,
            },
            pastDue: null,
            canceled: null,
            subscription: null,
            creditBalance: 120,
          },
        }),
    } as unknown as Response);

    const { result } = renderHook(() => useBillingStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.access.unlimited ?? false).toBe(false);
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
