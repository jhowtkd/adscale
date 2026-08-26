"use client";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const useBillingStatusMock = vi.fn();
const mockStartCheckoutMutateAsync = vi.fn();
const useStartCheckoutMock = vi.fn();

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

  it("triggers checkout mutation when start plan button is clicked", () => {
    useBillingStatusMock.mockReturnValue({
      data: { access: { hasSpendAccess: false } },
      isLoading: false,
    });
    render(<AccessGatePanel />);

    const checkoutButton = screen.getByRole("button", { name: "billing.accessGate.checkout" });
    fireEvent.click(checkoutButton);

    expect(mockStartCheckoutMutateAsync).toHaveBeenCalledWith({
      planKey: "starter",
      returnPath: "/",
    });
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
});
