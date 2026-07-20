import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/billing", () => ({
  getActiveSubscriptionByWorkspace: vi.fn(),
  getLatestSubscriptionByWorkspace: vi.fn(),
  getAvailableCreditGrants: vi.fn(),
}));

vi.mock("@/server/repositories/entitlements", () => ({
  getActiveBetaEntitlementByWorkspace: vi.fn(),
  getActiveTesterEntitlementByWorkspace: vi.fn(),
}));

vi.mock("@/server/auth/platform-owner", () => ({
  workspaceHasPlatformOwnerMember: vi.fn(),
}));

import {
  getActiveSubscriptionByWorkspace,
  getAvailableCreditGrants,
  getLatestSubscriptionByWorkspace,
} from "@/server/repositories/billing";
import {
  getActiveBetaEntitlementByWorkspace,
  getActiveTesterEntitlementByWorkspace,
} from "@/server/repositories/entitlements";
import { workspaceHasPlatformOwnerMember } from "@/server/auth/platform-owner";
import {
  getWorkspaceBillingAccess,
  normalizeSubscriptionStatus,
} from "./access";

const mockGetActiveSubscription = vi.mocked(getActiveSubscriptionByWorkspace);
const mockGetLatestSubscription = vi.mocked(getLatestSubscriptionByWorkspace);
const mockGetAvailableCreditGrants = vi.mocked(getAvailableCreditGrants);
const mockGetActiveBetaEntitlement = vi.mocked(getActiveBetaEntitlementByWorkspace);
const mockGetActiveTesterEntitlement = vi.mocked(getActiveTesterEntitlementByWorkspace);
const mockWorkspaceHasPlatformOwner = vi.mocked(workspaceHasPlatformOwnerMember);

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
    mockGetActiveTesterEntitlement.mockResolvedValue(null);
    mockGetLatestSubscription.mockResolvedValue(null);
    mockWorkspaceHasPlatformOwner.mockResolvedValue(false);
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

  it("returns unlimited access for a platform administrator", async () => {
    mockWorkspaceHasPlatformOwner.mockResolvedValue(true);

    const access = await getWorkspaceBillingAccess("workspace-1");

    expect(access.label).toBe("Dev admin");
    expect(access.creditBalance).toBe(999_999);
    expect(access.hasSpendAccess).toBe(true);
  });

  it("returns paid access with trialing status during trial period", async () => {
    const trialingSubscription = {
      ...activeSubscription,
      status: "trialing",
    };
    mockGetActiveSubscription.mockResolvedValue(trialingSubscription);
    mockGetLatestSubscription.mockResolvedValue(trialingSubscription);

    const access = await getWorkspaceBillingAccess("workspace-1");

    expect(access.kind).toBe("paid");
    expect(access.subscriptionStatus).toBe("trialing");
    expect(access.hasSpendAccess).toBe(true);
    expect(access.remainingAds).toBe(4);
  });

  it("returns tester access with unlimited spend", async () => {
    mockGetActiveSubscription.mockResolvedValue(null);
    mockGetActiveTesterEntitlement.mockResolvedValue({
      id: "tester-1",
      workspaceId: "workspace-1",
      kind: "tester",
      status: "active",
      sourceCode: null,
      redeemedByUserId: null,
      metadata: { notes: "QA cohort" },
      startsAt: new Date(),
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const access = await getWorkspaceBillingAccess("workspace-1");

    expect(access.kind).toBe("tester");
    expect(access.label).toBe("Tester");
    expect(access.hasSpendAccess).toBe(true);
    expect(access.creditBalance).toBe(999_999);
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

  it("allows spend on existing credits during past_due without beta access", async () => {
    const pastDueSubscription = {
      ...activeSubscription,
      status: "past_due",
    };
    mockGetActiveSubscription.mockResolvedValue(null);
    mockGetLatestSubscription.mockResolvedValue(pastDueSubscription);
    mockGetAvailableCreditGrants.mockResolvedValue([grant(30)]);

    const access = await getWorkspaceBillingAccess("workspace-1");

    expect(access.kind).toBe("paid");
    expect(access.label).toBe("Pagamento pendente");
    expect(access.subscriptionStatus).toBe("past_due");
    expect(access.hasSpendAccess).toBe(true);
    expect(access.remainingAds).toBe(6);
  });

  it("blocks spend during past_due when credit balance is exhausted", async () => {
    const pastDueSubscription = {
      ...activeSubscription,
      status: "past_due",
    };
    mockGetActiveSubscription.mockResolvedValue(null);
    mockGetLatestSubscription.mockResolvedValue(pastDueSubscription);
    mockGetAvailableCreditGrants.mockResolvedValue([]);

    const access = await getWorkspaceBillingAccess("workspace-1");

    expect(access.kind).toBe("none");
    expect(access.label).toBe("Pagamento pendente");
    expect(access.subscriptionStatus).toBe("past_due");
    expect(access.hasSpendAccess).toBe(false);
    expect(access.remainingAds).toBeNull();
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
