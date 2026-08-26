import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BillingTab from "./BillingTab";
import type { BillingStatus } from "@/lib/hooks/use-billing";

const mockPortalMutate = vi.fn();
const mockCheckoutMutate = vi.fn();

vi.mock("next-intl", () => ({
  useLocale: () => "pt-BR",
  useTranslations: (namespace: string) => {
    const t = ((key: string, values?: Record<string, string | number>) => {
      if (values) {
        return `${namespace}.${key}:${JSON.stringify(values)}`;
      }
      return `${namespace}.${key}`;
    }) as ReturnType<typeof import("next-intl").useTranslations>;
    t.has = (key: string) => key.startsWith("grants.sources.");
    return t;
  },
}));

const mockRouterReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ replace: mockRouterReplace })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("@/lib/hooks/use-billing", () => ({
  useBillingStatus: vi.fn(),
  useBillingPortal: vi.fn(() => ({
    mutate: mockPortalMutate,
    isPending: false,
  })),
  useStartCheckout: vi.fn(() => ({
    mutate: mockCheckoutMutate,
    isPending: false,
  })),
  useCreditHistory: vi.fn(),
}));

import { useBillingStatus, useCreditHistory } from "@/lib/hooks/use-billing";

const mockUseBillingStatus = vi.mocked(useBillingStatus);
const mockUseCreditHistory = vi.mocked(useCreditHistory);

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

function mockBillingStatus(data: BillingStatus, overrides?: Partial<ReturnType<typeof useBillingStatus>>) {
  mockUseBillingStatus.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    isSuccess: true,
    ...overrides,
  } as ReturnType<typeof useBillingStatus>);
}

describe("BillingTab account states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreditHistory.mockReturnValue({
      data: { grants: [], transactions: [], summary: undefined, campaigns: [] },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useCreditHistory>);
  });

  it("shows loading state", () => {
    mockUseBillingStatus.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useBillingStatus>);

    render(<BillingTab />, { wrapper: createWrapper() });
    expect(screen.getByText("billing.account.loading")).toBeInTheDocument();
  });

  it("shows error state", () => {
    mockUseBillingStatus.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useBillingStatus>);

    render(<BillingTab />, { wrapper: createWrapper() });
    expect(screen.getByText("billing.account.error")).toBeInTheDocument();
  });

  it("shows past_due banner with portal action", () => {
    mockBillingStatus({
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
      canceled: null,
      subscription: {
        status: "past_due",
        rawStatus: "past_due",
        planKey: "growth",
        currentPeriodEnd: "2026-06-01T00:00:00.000Z",
        cancelAtPeriodEnd: false,
      },
      creditBalance: 25,
    });

    render(<BillingTab />, { wrapper: createWrapper() });

    expect(screen.getByText("billing.account.pastDue.title")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "billing.account.pastDue.action" }));
    expect(mockPortalMutate).toHaveBeenCalled();
  });

  it("shows canceled banner with checkout action", () => {
    mockBillingStatus({
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
    });

    render(<BillingTab />, { wrapper: createWrapper() });

    expect(screen.getByText("billing.account.canceled.title")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "billing.account.canceled.action" }));
    expect(mockCheckoutMutate).toHaveBeenCalled();
  });

  it("shows beta access banner and kind label", () => {
    mockBillingStatus({
      hasCustomer: false,
      subscriptionStatus: "none",
      access: {
        kind: "beta",
        label: "Acesso beta",
        remainingAds: 7,
        hasSpendAccess: true,
        beta: { totalAds: 10, remainingAds: 7, exhausted: false },
      },
      pastDue: null,
      canceled: null,
      subscription: null,
      creditBalance: 35,
    });

    render(<BillingTab />, { wrapper: createWrapper() });

    expect(screen.getByText("billing.account.beta.title")).toBeInTheDocument();
    expect(screen.getAllByText("billing.account.accessKinds.beta").length).toBeGreaterThan(0);
  });

  it("shows active status from subscriptionStatus when subscription object is null", () => {
    mockBillingStatus({
      hasCustomer: true,
      subscriptionStatus: "active",
      access: {
        kind: "paid",
        label: "Dev admin",
        remainingAds: 100,
        hasSpendAccess: true,
        beta: null,
      },
      pastDue: null,
      canceled: null,
      subscription: null,
      creditBalance: 500,
    });

    render(<BillingTab />, { wrapper: createWrapper() });

    expect(screen.getByText("billing.account.statusLabels.active")).toBeInTheDocument();
    expect(screen.getByText("billing.account.financial.manageBilling")).toBeInTheDocument();
  });

  it("shows trialing renewal date in account section", () => {
    mockBillingStatus({
      hasCustomer: true,
      subscriptionStatus: "trialing",
      access: {
        kind: "paid",
        label: "Assinatura ativa",
        remainingAds: 6,
        hasSpendAccess: true,
        beta: null,
      },
      pastDue: null,
      canceled: null,
      subscription: {
        status: "trialing",
        rawStatus: "trialing",
        planKey: "starter",
        currentPeriodEnd: "2026-06-11T00:00:00.000Z",
        cancelAtPeriodEnd: false,
      },
      creditBalance: 30,
    });

    render(<BillingTab />, { wrapper: createWrapper() });

    expect(screen.getByText("billing.account.financial.trialEnds")).toBeInTheDocument();
    expect(screen.getByText(/jun.*2026/i)).toBeInTheDocument();
  });

  it("shows plan options and no beta redeem section for workspace with no access", () => {
    mockBillingStatus({
      hasCustomer: false,
      subscriptionStatus: "none",
      access: {
        kind: "none",
        label: "Sem acesso ativo",
        remainingAds: null,
        hasSpendAccess: false,
        beta: null,
      },
      pastDue: null,
      canceled: null,
      subscription: null,
      creditBalance: 0,
    });

    render(<BillingTab />, { wrapper: createWrapper() });

    expect(screen.getByText("billing.account.plans.title")).toBeInTheDocument();
    expect(screen.queryByText("billing.account.noAccess.title")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/beta/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /redeem/i })).not.toBeInTheDocument();
  });

  it("renders paid plan cards with active pricing model (300/1,200/3,600 credits and R$ 47/147/397)", () => {
    mockBillingStatus({
      hasCustomer: false,
      subscriptionStatus: "none",
      access: {
        kind: "none",
        label: "Sem acesso ativo",
        remainingAds: null,
        hasSpendAccess: false,
        beta: null,
      },
      pastDue: null,
      canceled: null,
      subscription: null,
      creditBalance: 0,
    });

    render(<BillingTab />, { wrapper: createWrapper() });

    expect(screen.getByText("Starter")).toBeInTheDocument();
    expect(screen.getByText("Growth")).toBeInTheDocument();
    expect(screen.getByText("Scale")).toBeInTheDocument();

    // Check pricing and credits derived from planTiers
    expect(screen.getByText(/R\$\s*47/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*147/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*397/)).toBeInTheDocument();

    expect(screen.getByText(/300/)).toBeInTheDocument();
    expect(screen.getByText(/1[.,]200/)).toBeInTheDocument();
    expect(screen.getByText(/3[.,]600/)).toBeInTheDocument();

    // Stale pricing must not be present
    expect(screen.queryByText(/29/)).not.toBeInTheDocument();
    expect(screen.queryByText(/79/)).not.toBeInTheDocument();
    expect(screen.queryByText(/199/)).not.toBeInTheDocument();

    // Buttons trigger checkout for respective plans
    const subscribeButtons = screen.getAllByRole("button", { name: "billing.account.plans.startTrial" });
    expect(subscribeButtons).toHaveLength(3);
    fireEvent.click(subscribeButtons[0]);
    expect(mockCheckoutMutate).toHaveBeenCalledWith({ planKey: "starter" });
  });

  it("renders grant history rows", () => {
    mockBillingStatus({
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
      subscription: {
        status: "active",
        rawStatus: "active",
        planKey: "growth",
        currentPeriodEnd: "2026-07-01T00:00:00.000Z",
        cancelAtPeriodEnd: false,
      },
      creditBalance: 120,
    });
    mockUseCreditHistory.mockReturnValue({
      data: {
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
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useCreditHistory>);

    render(<BillingTab />, { wrapper: createWrapper() });

    const grantsSection = screen.getByText("billing.account.grants.title").closest("div");
    expect(grantsSection).toBeTruthy();
    expect(screen.getByText("billing.account.grants.sources.stripe_invoice")).toBeInTheDocument();
    expect(grantsSection?.textContent).toContain("120");
  });

  it("shows empty grant history state", () => {
    mockBillingStatus({
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
      subscription: {
        status: "active",
        rawStatus: "active",
        planKey: "growth",
        currentPeriodEnd: "2026-07-01T00:00:00.000Z",
        cancelAtPeriodEnd: false,
      },
      creditBalance: 120,
    });

    render(<BillingTab />, { wrapper: createWrapper() });
    expect(screen.getByText("billing.account.grants.empty")).toBeInTheDocument();
  });
});
