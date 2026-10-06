// The screens on the free plan with the REAL `useFreePlanAccount` over a mocked billing-status request (ticket 11, part
// 2, review F8): not just the hook's value, the checkout buttons and the classic panels themselves. While the plan is
// unknown (loading, a first failed read, a payload without the field) nothing classic shows; a free plan already known
// survives a failed refetch; only a server answer of "not free" shows the classic screens.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ConversionErrorPayload } from "@/lib/billing/conversion-contract";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const t = ((key: string) => (namespace ? `${namespace}.${key}` : key)) as unknown as { raw: (key: string) => string[] };
    t.raw = () => ["feature"];
    return t;
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/billing/FreePlanCta", () => ({
  FreePlanCta: ({ accountId }: { accountId: string | null }) => <div data-testid="free-plan-cta" data-account-id={accountId ?? ""} />,
}));

import { AccessGatePanel } from "./AccessGatePanel";
import { ConversionCta } from "./ConversionCta";
import PlansTab from "@/components/settings/PlansTab";

const billing = (freePlan?: { accountId: string | null } | null) => ({
  ok: true,
  json: async () => ({ billing: { access: { hasSpendAccess: false }, ...(freePlan === undefined ? {} : { freePlan }) } }),
});
const payload: ConversionErrorPayload = {
  reason: "beta_exhausted", recommendedAction: "checkout", suggestedPlan: "starter", amount: 5, balance: 0,
  analytics: { reasonCode: "beta_exhausted", estimateCredits: 5 },
};

const surfaces = [
  ["PlansTab", () => <PlansTab />, "settings.plans.selectPlan"],
  ["AccessGatePanel", () => <AccessGatePanel />, "billing.accessGate.checkout"],
  ["ConversionCta", () => <ConversionCta payload={payload} />, "billing.conversion.actions.checkout"],
] as const;

function mount(ui: React.ReactNode, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

describe.each(surfaces)("%s with the real plan hook", (_name, ui, checkoutLabel) => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("while loading: no checkout button and no plan request", () => {
    apiFetch.mockReturnValue(new Promise(() => {}));

    mount(ui());

    expect(screen.queryByRole("button", { name: checkoutLabel })).not.toBeInTheDocument();
    expect(screen.queryByTestId("free-plan-cta")).not.toBeInTheDocument();
  });

  it("on the free plan: the plan request, no checkout button", async () => {
    apiFetch.mockResolvedValue(billing({ accountId: "acc-free" }));

    mount(ui());

    expect(await screen.findByTestId("free-plan-cta")).toHaveAttribute("data-account-id", "acc-free");
    expect(screen.queryByRole("button", { name: checkoutLabel })).not.toBeInTheDocument();
  });

  it("on the first failed read (network or 5xx): still no checkout button", async () => {
    apiFetch.mockRejectedValue(new Error("network"));

    mount(ui());

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("button", { name: checkoutLabel })).not.toBeInTheDocument();
  });

  it("for a payload without the field (legacy): still no checkout button", async () => {
    apiFetch.mockResolvedValue(billing(undefined));

    mount(ui());

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("button", { name: checkoutLabel })).not.toBeInTheDocument();
  });

  it("a free plan already known, then a failed refetch: the plan request stays, the checkout does not come back", async () => {
    apiFetch.mockResolvedValueOnce(billing({ accountId: "acc-free" }));
    const { client } = mount(ui());
    await screen.findByTestId("free-plan-cta");

    apiFetch.mockRejectedValue(new Error("network"));
    await client.refetchQueries({ queryKey: ["billing", "status"] });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));

    expect(screen.getByTestId("free-plan-cta")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: checkoutLabel })).not.toBeInTheDocument();
  });

  it("only when the server says it is not the free plan (freePlan: null): the classic screen", async () => {
    apiFetch.mockResolvedValue(billing(null));

    mount(ui());

    expect((await screen.findAllByRole("button", { name: checkoutLabel })).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("free-plan-cta")).not.toBeInTheDocument();
  });
});
