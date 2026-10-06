// PlansTab and the free plan (ticket 11, part 2): the classic plans are not offered to it (paying one would not lift the
// free plan), and nothing is offered before the plan is known.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const mockFreePlan = vi.hoisted(() => ({ value: null as { accountId: string } | null | undefined }));
vi.mock("@/lib/equipe/use-equipe", () => ({ useFreePlanAccount: () => mockFreePlan.value }));
vi.mock("@/components/billing/FreePlanCta", () => ({
  FreePlanCta: ({ accountId, intro }: { accountId: string; intro?: string }) => (
    <div data-testid="free-plan-cta" data-account-id={accountId}>{intro}</div>
  ),
}));
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const t = ((key: string) => (namespace ? `${namespace}.${key}` : key)) as unknown as { raw: (key: string) => string[] };
    t.raw = () => ["feature"];
    return t;
  },
}));
const mutateAsync = vi.fn();
vi.mock("@/lib/hooks/use-billing", () => ({
  useStartCheckout: () => ({ mutateAsync, isPending: false }),
}));

import PlansTab from "./PlansTab";

describe("PlansTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFreePlan.value = null;
    mutateAsync.mockResolvedValue(undefined);
  });

  it("on the free plan: the plan request with the billing intro and no plan button", () => {
    mockFreePlan.value = { accountId: "acc-free" };

    render(<PlansTab />);

    const cta = screen.getByTestId("free-plan-cta");
    expect(cta).toHaveAttribute("data-account-id", "acc-free");
    expect(cta).toHaveTextContent("billing.conversion.freePlan.billingIntro");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("while the plan is unknown: nothing (no checkout flash)", () => {
    mockFreePlan.value = undefined;

    const { container } = render(<PlansTab />);

    expect(container).toBeEmptyDOMElement();
  });

  it("a paid or classic workspace (null): the plan buttons start the checkout as before", () => {
    render(<PlansTab />);

    expect(screen.queryByTestId("free-plan-cta")).not.toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: "settings.plans.selectPlan" });
    expect(buttons.length).toBeGreaterThan(0);
    fireEvent.click(buttons[0]);
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({ planKey: expect.stringMatching(/^(starter|growth|scale)$/) });
  });
});
