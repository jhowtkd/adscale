import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/billing", () => ({
  getActiveSubscriptionByWorkspace: vi.fn(),
  getLatestSubscriptionByWorkspace: vi.fn(),
  getAvailableCreditGrants: vi.fn(),
}));

vi.mock("@/server/repositories/entitlements", () => ({
  getActiveBetaEntitlementByWorkspace: vi.fn(),
}));

import {
  getActiveSubscriptionByWorkspace,
  getAvailableCreditGrants,
  getLatestSubscriptionByWorkspace,
} from "@/server/repositories/billing";
import { getActiveBetaEntitlementByWorkspace } from "@/server/repositories/entitlements";
import {
  getWorkspaceBillingAccess,
  normalizeSubscriptionStatus,
} from "./access";

const mockGetActiveSubscription = vi.mocked(getActiveSubscriptionByWorkspace);
const mockGetLatestSubscription = vi.mocked(getLatestSubscriptionByWorkspace);
const mockGetAvailableCreditGrants = vi.mocked(getAvailableCreditGrants);
const mockGetActiveBetaEntitlement = vi.mocked(getActiveBetaEntitlementByWorkspace);

const activeSubscription = {
  id: "subscription-id",
  workspaceId: "workspace-1",
  billingCustomerId: null,
  stripeSubscriptionId: "sub_123",
  stripeCustomerId: "cus_123",
  status: "active",
  planKey: "starter",
  priceId: "price_starter",
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function grant(remaining: number) {
  return {
    id: "grant-1",
    workspaceId: "workspace-1",
    source: "subscription",
    sourceId: "sub_123",
    amount: remaining,
    remaining,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("normalizeSubscriptionStatus", () => {
  it.each([
    ["active", "active"],
    ["trialing", "trialing"],
    ["checkout_completed", "trialing"],
    ["past_due", "past_due"],
    ["canceled", "canceled"],
    [null, "none"],
    ["unknown", "none"],
  ] as const)("maps %s to %s", (raw, expected) => {
    expect(normalizeSubscriptionStatus(raw)).toBe(expected);
  });
});

describe("getWorkspaceBillingAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAvailableCreditGrants.mockResolvedValue([grant(20)]);
    mockGetActiveBetaEntitlement.mockResolvedValue(null);
    mockGetLatestSubscription.mockResolvedValue(null);
  });

  it("returns paid access when subscription is active", async () => {
    mockGetActiveSubscription.mockResolvedValue(activeSubscription);
    mockGetLatestSubscription.mockResolvedValue(activeSubscription);

    const access = await getWorkspaceBillingAccess("workspace-1");

    expect(access.kind).toBe("paid");
    expect(access.subscriptionStatus).toBe("active");
    expect(access.hasSpendAccess).toBe(true);
    expect(access.remainingAds).toBe(4);
  });

  it("returns beta access without subscription", async () => {
    mockGetActiveSubscription.mockResolvedValue(null);
    mockGetActiveBetaEntitlement.mockResolvedValue({
      id: "ent-1",
      workspaceId: "workspace-1",
      kind: "beta_tester",
      status: "active",
      sourceCode: "BETA2026",
      redeemedByUserId: "user-1",
      metadata: null,
      startsAt: new Date(),
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockGetAvailableCreditGrants.mockResolvedValue([grant(50)]);

    const access = await getWorkspaceBillingAccess("workspace-1");

    expect(access.kind).toBe("beta");
    expect(access.hasSpendAccess).toBe(true);
    expect(access.remainingAds).toBe(10);
  });

  it("returns none when neither paid nor beta access exists", async () => {
    mockGetActiveSubscription.mockResolvedValue(null);

    const access = await getWorkspaceBillingAccess("workspace-1");

    expect(access.kind).toBe("none");
    expect(access.subscriptionStatus).toBe("none");
    expect(access.hasSpendAccess).toBe(false);
  });

  it("exposes past_due subscription status while falling back to beta access", async () => {
    const pastDueSubscription = {
      ...activeSubscription,
      status: "past_due",
    };
    mockGetActiveSubscription.mockResolvedValue(null);
    mockGetLatestSubscription.mockResolvedValue(pastDueSubscription);
    mockGetActiveBetaEntitlement.mockResolvedValue({
      id: "ent-1",
      workspaceId: "workspace-1",
      kind: "beta_tester",
      status: "active",
      sourceCode: "BETA2026",
      redeemedByUserId: "user-1",
      metadata: null,
      startsAt: new Date(),
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const access = await getWorkspaceBillingAccess("workspace-1");

    expect(access.kind).toBe("beta");
    expect(access.subscriptionStatus).toBe("past_due");
    expect(access.latestSubscription?.status).toBe("past_due");
    expect(access.hasSpendAccess).toBe(true);
  });

  it("exposes canceled subscription status without paid spend access", async () => {
    const canceledSubscription = {
      ...activeSubscription,
      status: "canceled",
    };
    mockGetActiveSubscription.mockResolvedValue(null);
    mockGetLatestSubscription.mockResolvedValue(canceledSubscription);

    const access = await getWorkspaceBillingAccess("workspace-1");

    expect(access.kind).toBe("none");
    expect(access.subscriptionStatus).toBe("canceled");
    expect(access.hasSpendAccess).toBe(false);
  });

  it("falls back when beta entitlement lookup fails", async () => {
    mockGetActiveSubscription.mockResolvedValue(null);
    mockGetActiveBetaEntitlement.mockRejectedValue(new Error("relation missing"));

    const access = await getWorkspaceBillingAccess("workspace-1");

    expect(access.kind).toBe("none");
    expect(access.hasSpendAccess).toBe(false);
    expect(access.creditBalance).toBe(20);
  });
});
