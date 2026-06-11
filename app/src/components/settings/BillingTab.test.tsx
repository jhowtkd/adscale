import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BillingTab from "./BillingTab";

const mockPortalMutate = vi.fn();
const mockCheckoutMutate = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ replace: vi.fn() })),
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
  useRedeemBetaAccess: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

import { useBillingStatus } from "@/lib/hooks/use-billing";

const mockUseBillingStatus = vi.mocked(useBillingStatus);

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

describe("BillingTab past_due recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBillingStatus.mockReturnValue({
      data: {
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
          currentPeriodEnd: "2026-06-01T00:00:00.000Z",
          cancelAtPeriodEnd: false,
        },
        creditBalance: 25,
      },
      isLoading: false,
      isSuccess: true,
    } as ReturnType<typeof useBillingStatus>);
  });

  it("shows a past_due banner with remaining credits and portal action", () => {
    render(<BillingTab />, { wrapper: createWrapper() });

    expect(screen.getByText(/Não conseguimos processar sua última cobrança/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atualizar pagamento no portal" })).toBeInTheDocument();
  });

  it("opens the billing portal from the past_due recovery action", () => {
    render(<BillingTab />, { wrapper: createWrapper() });

    fireEvent.click(
      screen.getByRole("button", { name: "Atualizar pagamento no portal" })
    );

    expect(mockPortalMutate).toHaveBeenCalled();
  });
});
