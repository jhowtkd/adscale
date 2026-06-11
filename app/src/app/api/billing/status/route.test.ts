import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

vi.mock("@/server/repositories/billing", () => ({
  getBillingCustomerByWorkspace: vi.fn(),
}));

vi.mock("@/server/billing/access", () => ({
  getWorkspaceBillingAccess: vi.fn(),
  getBetaAllowanceSummary: vi.fn((remainingAds: number) => ({
    totalAds: 10,
    remainingAds,
    exhausted: remainingAds <= 0,
  })),
  PAST_DUE_SPEND_POLICY: "existing_credits_spendable",
}));

import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getWorkspaceBillingAccess } from "@/server/billing/access";
import { getBillingCustomerByWorkspace } from "@/server/repositories/billing";
import { GET } from "./route";

const mockRequireWorkspaceAccess = vi.mocked(requireWorkspaceAccess);
const mockGetWorkspaceBillingAccess = vi.mocked(getWorkspaceBillingAccess);
const mockGetBillingCustomer = vi.mocked(getBillingCustomerByWorkspace);

describe("billing status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireWorkspaceAccess.mockResolvedValue({
      workspace: { id: "workspace-1", name: "Test", slug: "test" },
      user: { id: "user-1", email: "test@example.com", name: "Test" },
    } as Awaited<ReturnType<typeof requireWorkspaceAccess>>);
    mockGetBillingCustomer.mockResolvedValue(null);
  });

  it("returns beta access without subscription", async () => {
    mockGetWorkspaceBillingAccess.mockResolvedValue({
      kind: "beta",
      label: "Acesso beta",
      creditBalance: 50,
      remainingAds: 10,
      hasSpendAccess: true,
      subscriptionStatus: "none",
      subscription: null,
      latestSubscription: null,
      betaEntitlement: { id: "ent-1" },
    } as Awaited<ReturnType<typeof getWorkspaceBillingAccess>>);

    const response = await GET(new Request("http://localhost/api/billing/status"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.billing.access.kind).toBe("beta");
    expect(body.billing.subscriptionStatus).toBe("none");
    expect(body.billing.subscription).toBeNull();
    expect(body.billing.access.beta.remainingAds).toBe(10);
  });

  it("returns past_due subscription status while beta access remains active", async () => {
    mockGetWorkspaceBillingAccess.mockResolvedValue({
      kind: "beta",
      label: "Acesso beta",
      creditBalance: 30,
      remainingAds: 6,
      hasSpendAccess: true,
      subscriptionStatus: "past_due",
      subscription: null,
      latestSubscription: {
        id: "sub-local",
        workspaceId: "workspace-1",
        billingCustomerId: null,
        stripeSubscriptionId: "sub_123",
        stripeCustomerId: "cus_123",
        status: "past_due",
        planKey: "starter",
        priceId: "price_starter",
        currentPeriodStart: new Date("2026-05-01T00:00:00.000Z"),
        currentPeriodEnd: new Date("2026-06-01T00:00:00.000Z"),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      betaEntitlement: { id: "ent-1" },
    } as Awaited<ReturnType<typeof getWorkspaceBillingAccess>>);

    const response = await GET(new Request("http://localhost/api/billing/status"));
    const body = await response.json();

    expect(body.billing.subscriptionStatus).toBe("past_due");
    expect(body.billing.access.kind).toBe("beta");
    expect(body.billing.subscription).toEqual({
      status: "past_due",
      rawStatus: "past_due",
      planKey: "starter",
      currentPeriodEnd: "2026-06-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
    });
    expect(body.billing.pastDue).toEqual({
      recoveryAction: "portal",
      spendPolicy: "existing_credits_spendable",
    });
  });

  it("returns trialing subscription with renewal date", async () => {
    mockGetWorkspaceBillingAccess.mockResolvedValue({
      kind: "paid",
      label: "Assinatura ativa",
      creditBalance: 30,
      remainingAds: 6,
      hasSpendAccess: true,
      subscriptionStatus: "trialing",
      subscription: {
        id: "sub-local",
        workspaceId: "workspace-1",
        billingCustomerId: null,
        stripeSubscriptionId: "sub_123",
        stripeCustomerId: "cus_123",
        status: "trialing",
        planKey: "starter",
        priceId: "price_starter",
        currentPeriodStart: new Date("2026-05-28T00:00:00.000Z"),
        currentPeriodEnd: new Date("2026-06-11T00:00:00.000Z"),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      latestSubscription: {
        id: "sub-local",
        workspaceId: "workspace-1",
        billingCustomerId: null,
        stripeSubscriptionId: "sub_123",
        stripeCustomerId: "cus_123",
        status: "trialing",
        planKey: "starter",
        priceId: "price_starter",
        currentPeriodStart: new Date("2026-05-28T00:00:00.000Z"),
        currentPeriodEnd: new Date("2026-06-11T00:00:00.000Z"),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      betaEntitlement: null,
    } as Awaited<ReturnType<typeof getWorkspaceBillingAccess>>);

    const response = await GET(new Request("http://localhost/api/billing/status"));
    const body = await response.json();

    expect(body.billing.subscriptionStatus).toBe("trialing");
    expect(body.billing.subscription?.currentPeriodEnd).toBe("2026-06-11T00:00:00.000Z");
    expect(body.billing.pastDue).toBeNull();
    expect(body.billing.canceled).toBeNull();
  });

  it("returns canceled recovery metadata with checkout action", async () => {
    mockGetWorkspaceBillingAccess.mockResolvedValue({
      kind: "none",
      label: "Sem acesso ativo",
      creditBalance: 0,
      remainingAds: null,
      hasSpendAccess: false,
      subscriptionStatus: "canceled",
      subscription: null,
      latestSubscription: {
        id: "sub-local",
        workspaceId: "workspace-1",
        billingCustomerId: null,
        stripeSubscriptionId: "sub_123",
        stripeCustomerId: "cus_123",
        status: "canceled",
        planKey: "growth",
        priceId: "price_growth",
        currentPeriodStart: new Date("2026-04-01T00:00:00.000Z"),
        currentPeriodEnd: new Date("2026-05-01T00:00:00.000Z"),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      betaEntitlement: null,
    } as Awaited<ReturnType<typeof getWorkspaceBillingAccess>>);

    const response = await GET(new Request("http://localhost/api/billing/status"));
    const body = await response.json();

    expect(body.billing.subscriptionStatus).toBe("canceled");
    expect(body.billing.canceled).toEqual({ recoveryAction: "checkout" });
    expect(body.billing.access.hasSpendAccess).toBe(false);
  });

  it("returns past_due recovery metadata for paid workspaces with failed payment", async () => {
    mockGetWorkspaceBillingAccess.mockResolvedValue({
      kind: "paid",
      label: "Pagamento pendente",
      creditBalance: 25,
      remainingAds: 5,
      hasSpendAccess: true,
      subscriptionStatus: "past_due",
      subscription: null,
      latestSubscription: {
        id: "sub-local",
        workspaceId: "workspace-1",
        billingCustomerId: null,
        stripeSubscriptionId: "sub_123",
        stripeCustomerId: "cus_123",
        status: "past_due",
        planKey: "growth",
        priceId: "price_growth",
        currentPeriodStart: new Date("2026-05-01T00:00:00.000Z"),
        currentPeriodEnd: new Date("2026-06-01T00:00:00.000Z"),
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      betaEntitlement: null,
    } as Awaited<ReturnType<typeof getWorkspaceBillingAccess>>);
    mockGetBillingCustomer.mockResolvedValue({
      id: "customer-1",
      workspaceId: "workspace-1",
      stripeCustomerId: "cus_123",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await GET(new Request("http://localhost/api/billing/status"));
    const body = await response.json();

    expect(body.billing.subscriptionStatus).toBe("past_due");
    expect(body.billing.access.hasSpendAccess).toBe(true);
    expect(body.billing.pastDue).toEqual({
      recoveryAction: "portal",
      spendPolicy: "existing_credits_spendable",
    });
  });
});
