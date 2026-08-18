"use client";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const useBillingStatusMock = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `billing.accessGate.${key}`,
}));
vi.mock("@/lib/hooks/use-billing", () => ({
  useBillingStatus: (...args: unknown[]) => useBillingStatusMock(...args),
  useRedeemBetaAccess: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useStartCheckout: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

import { AccessGatePanel } from "./AccessGatePanel";

describe("AccessGatePanel", () => {
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

  it("shows the unlock panel when there is no spend access", () => {
    useBillingStatusMock.mockReturnValue({
      data: { access: { hasSpendAccess: false } },
      isLoading: false,
    });
    render(<AccessGatePanel />);
    expect(screen.getByText("billing.accessGate.title")).toBeInTheDocument();
    expect(screen.getByText("billing.accessGate.description")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "billing.accessGate.redeem" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "billing.accessGate.checkout" })).toBeInTheDocument();
  });

  it("disables the redeem button until a code is typed", () => {
    useBillingStatusMock.mockReturnValue({
      data: { access: { hasSpendAccess: false } },
      isLoading: false,
    });
    render(<AccessGatePanel />);
    expect(screen.getByRole("button", { name: "billing.accessGate.redeem" })).toBeDisabled();
  });
});
