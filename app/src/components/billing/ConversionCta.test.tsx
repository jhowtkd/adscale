// ConversionCta and the free plan (ticket 11, part 2): `plan_request` is the plan request of flow 0, never a checkout,
// the portal or the billing page; the classic actions are untouched.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ConversionErrorPayload } from "@/lib/billing/conversion-contract";

// The free plan (ticket 11, part 2) is read from the Equipe accounts; these cases are a classic workspace unless a test
// sets it.
const mockFreePlan = vi.hoisted(() => ({ value: null as { accountId: string | null; closedAccountId?: string } | null | undefined }));
const mockAccountState = vi.hoisted(() => ({ value: { data: { planAvailable: true } } as { data?: { planAvailable?: boolean } } }));
const useEquipeAccountState = vi.hoisted(() => vi.fn());
vi.mock("@/lib/equipe/use-equipe", () => ({
  useFreePlanAccount: () => mockFreePlan.value,
  useEquipeAccountState: (...args: unknown[]) => useEquipeAccountState(...args),
}));
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
import { PLAN_PERSON_NOTE } from "@/lib/equipe/use-plan-request";

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
    mockFreePlan.value = null;
    mockAccountState.value = { data: { planAvailable: true } };
    useEquipeAccountState.mockImplementation(() => mockAccountState.value);
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

  it("plan_request without an accountId: the way to the conversation, no button, no command, no checkout", () => {
    renderCta({ ...freePlan, accountId: undefined });

    expect(screen.getByTestId("free-plan-cta")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "billing.conversion.freePlan.openConversation" })).toHaveAttribute("href", "/");
    expect(screen.getByText("billing.conversion.freePlan.noAccount")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(requestEquipeSupport).not.toHaveBeenCalled();
    expect(checkout).not.toHaveBeenCalled();
  });

  it("plan_request without an accountId when every account is closed (review R2): no link to the conversation, a person is asked through the closed account", async () => {
    mockFreePlan.value = { accountId: null, closedAccountId: "acc-closed" };
    renderCta({ ...freePlan, accountId: undefined });

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "billing.conversion.freePlan.action" }));

    await waitFor(() => expect(requestEquipeSupport).toHaveBeenCalledWith("acc-closed", { note: expect.any(String) }));
    expect(JSON.stringify(requestEquipeSupport.mock.calls[0][1])).not.toContain("purpose");
    expect(checkout).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("plan_request before the plan can be asked: a person is asked with the plan note, never a refused plan request", async () => {
    mockAccountState.value = { data: { planAvailable: false } };
    renderCta(freePlan);

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(requestEquipeSupport).toHaveBeenCalledTimes(1));
    expect(requestEquipeSupport).toHaveBeenCalledWith("acc-free", { note: PLAN_PERSON_NOTE });
    expect(checkout).not.toHaveBeenCalled();
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

  describe("a balance gate worked out on the client (no plan_request in the payload)", () => {
    const classic: ConversionErrorPayload = { ...base, reason: "beta_exhausted", recommendedAction: "checkout", suggestedPlan: "starter", returnPath: "/c" };

    it("on the free plan: the plan request of the plan's account, never a checkout, the portal or the billing page", async () => {
      mockFreePlan.value = { accountId: "acc-from-plan" };
      renderCta(classic);

      expect(screen.getByTestId("free-plan-cta")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "billing.conversion.actions.checkout" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button"));

      await waitFor(() => expect(requestEquipeSupport).toHaveBeenCalledWith("acc-from-plan", { purpose: "plan" }));
      expect(checkout).not.toHaveBeenCalled();
      expect(portal).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
    });

    it.each([
      ["checkout", { ...classic }],
      ["portal", { ...base, reason: "past_due_recovery", recommendedAction: "portal" } as ConversionErrorPayload],
      ["billing", { ...base, reason: "insufficient_credits", recommendedAction: "billing" } as ConversionErrorPayload],
    ])("while the plan is unknown: no %s button at all", (_name, payload) => {
      mockFreePlan.value = undefined;
      const { container } = renderCta(payload);

      expect(container).toBeEmptyDOMElement();
    });

    it("the payload's own account wins over the plan's when both say plan_request", async () => {
      mockFreePlan.value = { accountId: "acc-from-plan" };
      renderCta(freePlan);

      fireEvent.click(screen.getByRole("button"));

      await waitFor(() => expect(requestEquipeSupport).toHaveBeenCalledWith("acc-free", { purpose: "plan" }));
    });
  });
});
