import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/billing", () => ({
  getActiveSubscriptionByWorkspace: vi.fn(),
  getLatestSubscriptionByWorkspace: vi.fn(),
  getAvailableCreditGrants: vi.fn(),
}));

vi.mock("@/server/repositories/entitlements", () => ({
  getActiveBetaEntitlementByWorkspace: vi.fn(),
  getActiveTesterEntitlementByWorkspace: vi.fn(),
  getTrialEntitlementByWorkspace: vi.fn(),
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
  getTrialEntitlementByWorkspace,
} from "@/server/repositories/entitlements";
import { workspaceHasPlatformOwnerMember } from "@/server/auth/platform-owner";
import {
  getWorkspaceBillingAccess,
  normalizeSubscriptionStatus,
} from "./access";
import { canSpend } from "./credits";

const mockGetActiveSubscription = vi.mocked(getActiveSubscriptionByWorkspace);
const mockGetLatestSubscription = vi.mocked(getLatestSubscriptionByWorkspace);
const mockGetAvailableCreditGrants = vi.mocked(getAvailableCreditGrants);
const mockGetActiveBetaEntitlement = vi.mocked(getActiveBetaEntitlementByWorkspace);
const mockGetActiveTesterEntitlement = vi.mocked(getActiveTesterEntitlementByWorkspace);
const mockGetTrialEntitlement = vi.mocked(getTrialEntitlementByWorkspace);
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
    mockGetAvailableCreditGrants.mockResolvedValue([grant(200)]);
    mockGetActiveBetaEntitlement.mockResolvedValue(null);
    mockGetActiveTesterEntitlement.mockResolvedValue(null);
    mockGetTrialEntitlement.mockResolvedValue(null);
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
    mockGetAvailableCreditGrants.mockResolvedValue([grant(500)]);

    const access = await getWorkspaceBillingAccess("workspace-1");

    expect(access.kind).toBe("beta");
    expect(access.hasSpendAccess).toBe(true);
    expect(access.remainingAds).toBe(10);
  });

  it("paid subscription wins over trial", async () => {
    mockGetActiveSubscription.mockResolvedValue(activeSubscription);
    mockGetLatestSubscription.mockResolvedValue(activeSubscription);
    mockGetTrialEntitlement.mockResolvedValue({
      id: "trial-1",
      workspaceId: "workspace-1",
      kind: "trial",
      status: "active",
      sourceCode: null,
      redeemedByUserId: "user-1",
      metadata: null,
      startsAt: new Date(),
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const access = await getWorkspaceBillingAccess("workspace-1");

    expect(access.kind).toBe("paid");
    expect(access.label).toBe("Assinatura ativa");
    expect(access.hasSpendAccess).toBe(true);
    expect(access.trialEntitlement?.status).toBe("active");
  });

  it("active trial with positive balance spends", async () => {
    mockGetActiveSubscription.mockResolvedValue(null);
    mockGetTrialEntitlement.mockResolvedValue({
      id: "trial-1",
      workspaceId: "workspace-1",
      kind: "trial",
      status: "active",
      sourceCode: null,
      redeemedByUserId: "user-1",
      metadata: null,
      startsAt: new Date(),
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockGetAvailableCreditGrants.mockResolvedValue([grant(500)]);

    const access = await getWorkspaceBillingAccess("workspace-1");

    expect(access.kind).toBe("trial");
    expect(access.label).toBe("Trial");
    expect(access.hasSpendAccess).toBe(true);
    expect(access.remainingAds).toBe(10);
    expect(access.creditBalance).toBe(500);
    expect(access.trialEntitlement?.id).toBe("trial-1");

    const spendCheck = await canSpend("workspace-1", "image_derivation");
    expect(spendCheck.allowed).toBe(true);
    expect(spendCheck.amount).toBe(50);
  });

  it("active trial with zero balance remains kind: trial and causes canSpend to return insufficient_credits", async () => {
    mockGetActiveSubscription.mockResolvedValue(null);
    mockGetTrialEntitlement.mockResolvedValue({
      id: "trial-1",
      workspaceId: "workspace-1",
      kind: "trial",
      status: "active",
      sourceCode: null,
      redeemedByUserId: "user-1",
      metadata: null,
      startsAt: new Date(),
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockGetAvailableCreditGrants.mockResolvedValue([]);

    const access = await getWorkspaceBillingAccess("workspace-1");

    expect(access.kind).toBe("trial");
    expect(access.label).toBe("Trial");
    expect(access.hasSpendAccess).toBe(true);
    expect(access.remainingAds).toBe(0);
    expect(access.creditBalance).toBe(0);

    const spendCheck = await canSpend("workspace-1", "image_derivation");
    expect(spendCheck).toEqual({
      allowed: false,
      amount: 50,
      balance: 0,
      reason: "insufficient_credits",
    });
  });

  it("pending trial returns no spend access (kind: none)", async () => {
    mockGetActiveSubscription.mockResolvedValue(null);
    mockGetTrialEntitlement.mockResolvedValue({
      id: "trial-1",
      workspaceId: "workspace-1",
      kind: "trial",
      status: "pending_verification",
      sourceCode: null,
      redeemedByUserId: "user-1",
      metadata: null,
      startsAt: new Date(),
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockGetAvailableCreditGrants.mockResolvedValue([]);

    const access = await getWorkspaceBillingAccess("workspace-1");

    expect(access.kind).toBe("none");
    expect(access.hasSpendAccess).toBe(false);
    expect(access.remainingAds).toBeNull();
    expect(access.trialEntitlement?.status).toBe("pending_verification");

    const spendCheck = await canSpend("workspace-1", "image_derivation");
    expect(spendCheck).toEqual({
      allowed: false,
      amount: 50,
      balance: 0,
      reason: "inactive_subscription",
    });
  });

  it("returns none when neither paid, trial, nor beta access exists", async () => {
    mockGetActiveSubscription.mockResolvedValue(null);

    const access = await getWorkspaceBillingAccess("workspace-1");

    expect(access.kind).toBe("none");
    expect(access.subscriptionStatus).toBe("none");
    expect(access.hasSpendAccess).toBe(false);
    expect(access.trialEntitlement).toBeNull();
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
    mockGetAvailableCreditGrants.mockResolvedValue([grant(300)]);

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
    expect(access.creditBalance).toBe(200);
  });

  it("falls back when trial entitlement lookup fails", async () => {
    mockGetActiveSubscription.mockResolvedValue(null);
    mockGetTrialEntitlement.mockRejectedValue(new Error("trial relation missing"));

    const access = await getWorkspaceBillingAccess("workspace-1");

    expect(access.kind).toBe("none");
    expect(access.hasSpendAccess).toBe(false);
    expect(access.trialEntitlement).toBeNull();
  });
});
