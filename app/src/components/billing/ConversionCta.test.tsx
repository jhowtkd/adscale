// ConversionCta and the free plan (ticket 11, part 2): `plan_request` is the plan request of flow 0, never a checkout,
// the portal or the billing page; the classic actions are untouched.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ConversionErrorPayload } from "@/lib/billing/conversion-contract";

// The free plan (ticket 11, part 2) is read from the Equipe accounts; these cases are a classic workspace unless a test
// sets it.
const mockFreePlan = vi.hoisted(() => ({ value: null as { accountId: string } | null | undefined }));
vi.mock("@/lib/equipe/use-equipe", () => ({ useFreePlanAccount: () => mockFreePlan.value }));
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) => (namespace ? `${namespace}.${key}` : key),
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const checkout = vi.fn();
const portal = vi.fn();
vi.mock("@/lib/hooks/use-billing", () => ({
  useStartCheckout: () => ({ mutateAsync: checkout, isPending: false }),
  useBillingPortal: () => ({ mutateAsync: portal, isPending: false }),
}));
const requestEquipeSupport = vi.fn();
vi.mock("@/lib/equipe/commands", () => ({ requestEquipeSupport: (...args: unknown[]) => requestEquipeSupport(...args) }));

import { ConversionCta } from "./ConversionCta";

const base = { amount: 50, balance: 500, analytics: { reasonCode: "x", estimateCredits: 50 } };
const freePlan: ConversionErrorPayload = { ...base, reason: "free_plan", recommendedAction: "plan_request", accountId: "acc-free" };

function renderCta(payload: ConversionErrorPayload) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConversionCta payload={payload} />
    </QueryClientProvider>
  );
}

describe("ConversionCta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkout.mockResolvedValue(undefined);
    portal.mockResolvedValue(undefined);
    requestEquipeSupport.mockResolvedValue({});
  });

  it("plan_request renders the free plan CTA, 'Falar com uma pessoa', and no classic button", () => {
    renderCta(freePlan);

    expect(screen.getByTestId("free-plan-cta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "billing.conversion.freePlan.action" })).toBeInTheDocument();
    expect(screen.queryByText("billing.conversion.actions.plan_request")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("clicking asks for the plan of the payload's account and never starts a checkout, the portal or the billing page", async () => {
    renderCta(freePlan);

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(requestEquipeSupport).toHaveBeenCalledWith("acc-free", { purpose: "plan" }));
    expect(requestEquipeSupport).toHaveBeenCalledTimes(1);
    expect(checkout).not.toHaveBeenCalled();
    expect(portal).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("the classic checkout is unchanged: its label and its click", async () => {
    renderCta({ ...base, reason: "beta_exhausted", recommendedAction: "checkout", suggestedPlan: "starter", returnPath: "/c" });

    expect(screen.queryByTestId("free-plan-cta")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "billing.conversion.actions.checkout" }));

    await waitFor(() => expect(checkout).toHaveBeenCalledWith({ planKey: "starter", returnPath: "/c" }));
    expect(requestEquipeSupport).not.toHaveBeenCalled();
  });

  it("the classic portal and billing actions are unchanged", async () => {
    const { unmount } = renderCta({ ...base, reason: "past_due_recovery", recommendedAction: "portal" });
    fireEvent.click(screen.getByRole("button", { name: "billing.conversion.actions.portal" }));
    await waitFor(() => expect(portal).toHaveBeenCalledTimes(1));
    unmount();

    renderCta({ ...base, reason: "insufficient_credits", recommendedAction: "billing", returnPath: "/c" });
    fireEvent.click(screen.getByRole("button", { name: "billing.conversion.actions.billing" }));
    expect(push).toHaveBeenCalledWith("/settings?tab=billing&returnPath=%2Fc");
    expect(requestEquipeSupport).not.toHaveBeenCalled();
  });
});
