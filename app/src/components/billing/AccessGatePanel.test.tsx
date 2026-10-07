"use client";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const useBillingStatusMock = vi.fn();
const mockStartCheckoutMutateAsync = vi.fn();
const useStartCheckoutMock = vi.fn();

// The free plan (ticket 11, part 2) is read from the Equipe accounts; these cases are a classic workspace unless a test
// sets it.
const mockFreePlan = vi.hoisted(() => ({ value: null as { accountId: string } | null | undefined }));
vi.mock("@/lib/equipe/use-equipe", () => ({ useFreePlanAccount: () => mockFreePlan.value }));
vi.mock("@/components/billing/FreePlanCta", () => ({
  FreePlanCta: ({ accountId }: { accountId: string }) => <div data-testid="free-plan-cta" data-account-id={accountId} />,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `billing.accessGate.${key}`,
}));

vi.mock("@/lib/hooks/use-billing", () => ({
  useBillingStatus: (...args: unknown[]) => useBillingStatusMock(...args),
  useStartCheckout: (...args: unknown[]) => useStartCheckoutMock(...args),
}));

import { AccessGatePanel } from "./AccessGatePanel";
import { beforeEach } from "vitest";

describe("AccessGatePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFreePlan.value = null;
    useStartCheckoutMock.mockReturnValue({
      mutateAsync: mockStartCheckoutMutateAsync,
      isPending: false,
      isError: false,
      error: null,
    });
  });

  it("renders nothing while billing is loading", () => {
    useBillingStatusMock.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<AccessGatePanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the workspace already has spend access", () => {
    useBillingStatusMock.mockReturnValue({
      data: { access: { hasSpendAccess: true } },
      isLoading: false,
    });
    const { container } = render(<AccessGatePanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the unlock panel with checkout action when there is no spend access", () => {
    useBillingStatusMock.mockReturnValue({
      data: { access: { hasSpendAccess: false } },
      isLoading: false,
    });
    render(<AccessGatePanel />);
    expect(screen.getByText("billing.accessGate.title")).toBeInTheDocument();
    expect(screen.getByText("billing.accessGate.description")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "billing.accessGate.checkout" })).toBeInTheDocument();

    // Verify no beta code input or redeem button exists
    expect(screen.queryByPlaceholderText(/beta/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /redeem/i })).not.toBeInTheDocument();
  });

  it("triggers checkout and comes back to the page that asked for it (spec 2026-10-07 §2)", () => {
    useBillingStatusMock.mockReturnValue({
      data: { access: { hasSpendAccess: false } },
      isLoading: false,
    });
    window.history.pushState({}, "", "/creative-work/new?compose=1");
    try {
      render(<AccessGatePanel />);
      fireEvent.click(screen.getByRole("button", { name: "billing.accessGate.checkout" }));
      expect(mockStartCheckoutMutateAsync).toHaveBeenCalledWith({
        planKey: "starter",
        returnPath: "/creative-work/new?compose=1",
      });
    } finally {
      window.history.pushState({}, "", "/");
    }
  });

  it("shows error message when checkout fails with an Error instance", () => {
    useBillingStatusMock.mockReturnValue({
      data: { access: { hasSpendAccess: false } },
      isLoading: false,
    });
    useStartCheckoutMock.mockReturnValue({
      mutateAsync: mockStartCheckoutMutateAsync,
      isPending: false,
      isError: true,
      error: new Error("Falha ao abrir checkout"),
    });
    render(<AccessGatePanel />);

    expect(screen.getByText("Falha ao abrir checkout")).toBeInTheDocument();
  });

  it("falls back to checkoutError translation when checkout fails with non-Error", () => {
    useBillingStatusMock.mockReturnValue({
      data: { access: { hasSpendAccess: false } },
      isLoading: false,
    });
    useStartCheckoutMock.mockReturnValue({
      mutateAsync: mockStartCheckoutMutateAsync,
      isPending: false,
      isError: true,
      error: null,
    });
    render(<AccessGatePanel />);

    expect(screen.getByText("billing.accessGate.checkoutError")).toBeInTheDocument();
  });

  it("shows redirecting state on button when checkout is pending", () => {
    useBillingStatusMock.mockReturnValue({
      data: { access: { hasSpendAccess: false } },
      isLoading: false,
    });
    useStartCheckoutMock.mockReturnValue({
      mutateAsync: mockStartCheckoutMutateAsync,
      isPending: true,
      isError: false,
      error: null,
    });
    render(<AccessGatePanel />);

    expect(screen.getByRole("button", { name: "billing.accessGate.redirecting" })).toBeDisabled();
  });

  describe("the free plan (ticket 11, part 2)", () => {
    it("shows the plan request and no checkout button, even when billing has no spend access", () => {
      mockFreePlan.value = { accountId: "acc-free" };
      useBillingStatusMock.mockReturnValue({ data: { access: { hasSpendAccess: false } }, isLoading: false });

      render(<AccessGatePanel />);

      expect(screen.getByTestId("free-plan-cta")).toHaveAttribute("data-account-id", "acc-free");
      expect(screen.queryByRole("button", { name: "billing.accessGate.checkout" })).not.toBeInTheDocument();
      expect(mockStartCheckoutMutateAsync).not.toHaveBeenCalled();
    });

    it("while the plan is unknown: nothing at all (no checkout flash)", () => {
      mockFreePlan.value = undefined;
      useBillingStatusMock.mockReturnValue({ data: { access: { hasSpendAccess: false } }, isLoading: false });

      const { container } = render(<AccessGatePanel />);

      expect(container).toBeEmptyDOMElement();
    });

    it("a paid or classic workspace (null) keeps the unlock panel", () => {
      mockFreePlan.value = null;
      useBillingStatusMock.mockReturnValue({ data: { access: { hasSpendAccess: false } }, isLoading: false });

      render(<AccessGatePanel />);

      expect(screen.getByRole("button", { name: "billing.accessGate.checkout" })).toBeInTheDocument();
      expect(screen.queryByTestId("free-plan-cta")).not.toBeInTheDocument();
    });
  });
});
