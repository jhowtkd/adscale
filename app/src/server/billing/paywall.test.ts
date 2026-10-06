import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseConversionErrorPayload } from "@/lib/billing/conversion-contract";

vi.mock("./credits", () => ({
  recordUsage: vi.fn(),
  canSpend: vi.fn(),
}));

vi.mock("./access", () => ({
  getWorkspaceBillingAccess: vi.fn(),
}));

vi.mock("@/server/equipe/module/free-plan", () => ({
  findFreePlanAccount: vi.fn(),
}));

vi.mock("@/lib/api-response", () => ({
  apiError: vi.fn((code: string, status: number, details?: unknown) => ({
    status,
    json: async () => ({ code, details }),
  })),
}));

import { recordUsage } from "./credits";
import { getWorkspaceBillingAccess } from "./access";
import { apiError } from "@/lib/api-response";
import { findFreePlanAccount } from "@/server/equipe/module/free-plan";
import { creditBlockedApiError, freePlanApiError, getAccess, getAccessFromBilling, refuseOnFreePlan, spend, spendOrApiError } from "./paywall";

const mockFindFreePlanAccount = vi.mocked(findFreePlanAccount);

const mockRecordUsage = vi.mocked(recordUsage);
const mockGetWorkspaceBillingAccess = vi.mocked(getWorkspaceBillingAccess);
const mockApiError = vi.mocked(apiError);

const paidAccess = {
  kind: "paid" as const,
  label: "Assinatura ativa",
  creditBalance: 20,
  remainingAds: 4,
  hasSpendAccess: true,
  subscriptionStatus: "active" as const,
  subscription: null,
  latestSubscription: null,
  betaEntitlement: null,
  testerEntitlement: null,
};

const betaExhaustedAccess = {
  kind: "beta" as const,
  label: "Acesso beta",
  creditBalance: 0,
  remainingAds: 0,
  hasSpendAccess: true,
  subscriptionStatus: "none" as const,
  subscription: null,
  latestSubscription: null,
  betaEntitlement: { id: "beta-1" },
  testerEntitlement: null,
};

describe("paywall.spend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok when usage is recorded", async () => {
    mockRecordUsage.mockResolvedValue({
      status: "recorded",
      usage: {},
      check: { allowed: true, amount: 5, balance: 20 },
    } as Awaited<ReturnType<typeof recordUsage>>);

    await expect(
      spend({
        workspaceId: "workspace-1",
        action: "image_derivation",
        idempotencyKey: "usage-key",
      })
    ).resolves.toEqual({ ok: true, creditsSpent: 5 });
  });

  it("returns ok with duplicate flag for idempotent replays", async () => {
    mockRecordUsage.mockResolvedValue({
      status: "duplicate",
      usage: {},
    } as Awaited<ReturnType<typeof recordUsage>>);

    await expect(
      spend({
        workspaceId: "workspace-1",
        action: "image_derivation",
        idempotencyKey: "usage-key",
      })
    ).resolves.toEqual({ ok: true, creditsSpent: 0, duplicate: true });
  });

  it("returns 402 conversion payload when spend is blocked", async () => {
    mockRecordUsage.mockResolvedValue({
      status: "blocked",
      check: {
        allowed: false,
        amount: 5,
        balance: 0,
        reason: "insufficient_credits",
      },
    });
    mockGetWorkspaceBillingAccess.mockResolvedValue(betaExhaustedAccess as typeof paidAccess);

    const result = await spend({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "usage-key",
      returnPath: "/campaigns/c1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.conversionPayload).toMatchObject({
      reason: "beta_exhausted",
      recommendedAction: "checkout",
      amount: 5,
      balance: 0,
      returnPath: "/campaigns/c1",
    });
    expect(mockGetWorkspaceBillingAccess).toHaveBeenCalledWith("workspace-1");
  });

  it("keeps conversion payload compatible with the client contract parser", async () => {
    mockRecordUsage.mockResolvedValue({
      status: "blocked",
      check: {
        allowed: false,
        amount: 5,
        balance: 0,
        reason: "inactive_subscription",
      },
    });
    mockGetWorkspaceBillingAccess.mockResolvedValue({
      ...paidAccess,
      kind: "none",
      hasSpendAccess: false,
      subscriptionStatus: "none",
    } as typeof paidAccess);

    const result = await spend({
      workspaceId: "workspace-1",
      action: "creative_plan",
      idempotencyKey: "usage-key",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(parseConversionErrorPayload(result.conversionPayload)).toEqual(
      result.conversionPayload
    );
  });

  it("records spend for unlimited-access workspaces without blocking", async () => {
    mockRecordUsage.mockResolvedValue({
      status: "recorded",
      usage: {},
      check: { allowed: true, amount: 5, balance: 999_999 },
    } as Awaited<ReturnType<typeof recordUsage>>);

    await expect(
      spend({
        workspaceId: "workspace-tester",
        action: "image_derivation",
        idempotencyKey: "usage-key",
      })
    ).resolves.toEqual({ ok: true, creditsSpent: 5 });
  });
});

describe("paywall.spendOrApiError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows requests when usage is recorded", async () => {
    mockRecordUsage.mockResolvedValue({
      status: "recorded",
      usage: {},
      check: { allowed: true, amount: 5, balance: 20 },
    } as Awaited<ReturnType<typeof recordUsage>>);

    await expect(
      spendOrApiError({
        workspaceId: "workspace-1",
        action: "image_derivation",
        idempotencyKey: "test-key",
      })
    ).resolves.toBeNull();
  });

  it("returns structured conversion payload when usage is blocked", async () => {
    mockRecordUsage.mockResolvedValue({
      status: "blocked",
      check: {
        allowed: false,
        amount: 5,
        balance: 0,
        reason: "insufficient_credits",
      },
    });
    mockGetWorkspaceBillingAccess.mockResolvedValue(betaExhaustedAccess as typeof paidAccess);

    const response = await spendOrApiError({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "test-key",
      returnPath: "/campaigns/c1",
    });
    const body = await response?.json();

    expect(response?.status).toBe(402);
    expect(body?.code).toBe("beta_exhausted");
    expect(body?.details).toMatchObject({
      reason: "beta_exhausted",
      recommendedAction: "checkout",
      returnPath: "/campaigns/c1",
    });
    expect(mockApiError).toHaveBeenCalledWith(
      "beta_exhausted",
      402,
      expect.objectContaining({
        reason: "beta_exhausted",
        returnPath: "/campaigns/c1",
      })
    );
  });

  it("forwards userId to recordUsage for analytics emission", async () => {
    mockRecordUsage.mockResolvedValue({
      status: "blocked",
      check: {
        allowed: false,
        amount: 5,
        balance: 0,
        reason: "insufficient_credits",
      },
    });
    mockGetWorkspaceBillingAccess.mockResolvedValue(betaExhaustedAccess as typeof paidAccess);

    await spendOrApiError({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "test-key",
      userId: "user-1",
    });

    expect(mockRecordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
      })
    );
  });
});

describe("paywall.getAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to getWorkspaceBillingAccess", async () => {
    mockGetWorkspaceBillingAccess.mockResolvedValue(paidAccess);

    await expect(getAccess("workspace-1")).resolves.toEqual(paidAccess);
    expect(mockGetWorkspaceBillingAccess).toHaveBeenCalledWith("workspace-1");
  });
});

describe("paywall.getAccessFromBilling", () => {
  it("returns the billing access snapshot unchanged", () => {
    expect(getAccessFromBilling(paidAccess)).toBe(paidAccess);
  });
});

describe("paywall: the free plan (ticket 11, part 2)", () => {
  const freeCheck = { allowed: false as const, amount: 5, balance: 500, reason: "free_plan" as const, accountId: "acc-free" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFreePlanAccount.mockResolvedValue(null);
  });

  it("spend answers the plan request with the account, whatever the subscription says", async () => {
    mockRecordUsage.mockResolvedValue({ status: "blocked", check: freeCheck });
    mockGetWorkspaceBillingAccess.mockResolvedValue(betaExhaustedAccess as never);

    const result = await spend({ workspaceId: "workspace-1", action: "image_derivation", idempotencyKey: "k", returnPath: "/c" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.conversionPayload).toMatchObject({
      reason: "free_plan",
      recommendedAction: "plan_request",
      accountId: "acc-free",
      returnPath: "/c",
    });
    expect(parseConversionErrorPayload(result.conversionPayload)).toEqual(result.conversionPayload);
  });

  it("spendOrApiError answers 402 with code free_plan and the payload", async () => {
    mockRecordUsage.mockResolvedValue({ status: "blocked", check: freeCheck });
    mockGetWorkspaceBillingAccess.mockResolvedValue(paidAccess as never);

    const response = await spendOrApiError({ workspaceId: "workspace-1", action: "image_derivation", idempotencyKey: "k" });
    const body = await response?.json();

    expect(response?.status).toBe(402);
    expect(body?.code).toBe("free_plan");
    expect(body?.details).toMatchObject({ recommendedAction: "plan_request", accountId: "acc-free" });
  });

  describe("creditBlockedApiError", () => {
    const planPayload = {
      reason: "free_plan",
      recommendedAction: "plan_request",
      accountId: "acc-free",
      amount: 5,
      balance: 500,
      analytics: { reasonCode: "free_plan", estimateCredits: 5 },
    };

    it("a free plan payload becomes 402 free_plan with that payload, without asking the rule", async () => {
      const response = await creditBlockedApiError("workspace-1", "insufficientCredits", planPayload);

      expect(response.status).toBe(402);
      expect(mockApiError).toHaveBeenCalledWith("free_plan", 402, expect.objectContaining({ accountId: "acc-free", recommendedAction: "plan_request" }));
      expect(mockFindFreePlanAccount).not.toHaveBeenCalled();
    });

    it("a payload wrapped in a spend result ({ conversionPayload }) is the same", async () => {
      await creditBlockedApiError("workspace-1", "creditBlocked", { conversionPayload: planPayload });

      expect(mockApiError).toHaveBeenCalledWith("free_plan", 402, expect.objectContaining({ accountId: "acc-free" }));
      expect(mockFindFreePlanAccount).not.toHaveBeenCalled();
    });

    it("a raw free_plan check is turned into the payload, keeping amount and balance", async () => {
      await creditBlockedApiError("workspace-1", "insufficientCredits", freeCheck);

      expect(mockApiError).toHaveBeenCalledWith(
        "free_plan",
        402,
        expect.objectContaining({
          reason: "free_plan",
          recommendedAction: "plan_request",
          accountId: "acc-free",
          amount: 5,
          balance: 500,
        })
      );
      expect(mockFindFreePlanAccount).not.toHaveBeenCalled();
    });

    it("with no details on the free plan, the rule is asked and the answer is the free plan's", async () => {
      mockFindFreePlanAccount.mockResolvedValue({ accountId: "acc-free" });

      const response = await creditBlockedApiError("workspace-1", "insufficientCredits");

      expect(response.status).toBe(402);
      expect(mockFindFreePlanAccount).toHaveBeenCalledWith("workspace-1");
      expect(mockApiError).toHaveBeenCalledWith(
        "free_plan",
        402,
        expect.objectContaining({ recommendedAction: "plan_request", accountId: "acc-free", amount: 0, balance: 0 })
      );
    });

    it("with no details on a classic workspace, it is exactly apiError(code, 402) as before", async () => {
      await creditBlockedApiError("workspace-1", "insufficientCredits");

      expect(mockFindFreePlanAccount).toHaveBeenCalledWith("workspace-1");
      expect(mockApiError).toHaveBeenCalledTimes(1);
      expect(mockApiError.mock.calls[0]).toEqual(["insufficientCredits", 402]);
    });

    it("classic details pass through untouched: apiError(code, 402, details), same object", async () => {
      const details = { reason: "insufficient_credits", required: 5 };

      await creditBlockedApiError("workspace-1", "creditBlocked", details);

      expect(mockApiError.mock.calls).toEqual([["creditBlocked", 402, details]]);
      expect(mockApiError.mock.calls[0][2]).toBe(details);
      expect(mockFindFreePlanAccount).toHaveBeenCalledTimes(1);
    });

    it("a payload of another reason never reads the rule again and keeps the route's code", async () => {
      const details = {
        reason: "beta_exhausted",
        recommendedAction: "checkout",
        amount: 5,
        balance: 0,
        analytics: { reasonCode: "beta_exhausted", estimateCredits: 5 },
      };
      // Even if the rule would now say free: the payload already says why the spend was refused.
      mockFindFreePlanAccount.mockResolvedValue({ accountId: "acc-free" });

      await creditBlockedApiError("workspace-1", "creditBlocked", details);

      expect(mockFindFreePlanAccount).not.toHaveBeenCalled();
      expect(mockApiError.mock.calls).toEqual([["creditBlocked", 402, details]]);
    });
  });
});

describe("paywall.refuseOnFreePlan and freePlanApiError (ticket 11, part 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFreePlanAccount.mockResolvedValue(null);
  });

  it("freePlanApiError is 402 free_plan with the plan request of that account, amount and balance 0 by default", async () => {
    const response = await freePlanApiError("acc-free");

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("free_plan");
    expect(body.details).toEqual({
      reason: "free_plan",
      recommendedAction: "plan_request",
      accountId: "acc-free",
      amount: 0,
      balance: 0,
      returnPath: undefined,
      analytics: { reasonCode: "free_plan", estimateCredits: 0 },
    });
    expect(parseConversionErrorPayload(body.details)).toMatchObject({ accountId: "acc-free", recommendedAction: "plan_request" });
  });

  it("freePlanApiError carries the refused spend's amount and balance, and never reads the subscription", async () => {
    const response = await freePlanApiError("acc-free", { amount: 50, balance: 500 });

    const body = await response.json();
    expect(body.details).toMatchObject({ amount: 50, balance: 500, analytics: { estimateCredits: 50 } });
    expect(body.details).not.toHaveProperty("suggestedPlan");
    expect(mockGetWorkspaceBillingAccess).not.toHaveBeenCalled();
  });

  it("refuseOnFreePlan on the free plan answers freePlanApiError for the entry account", async () => {
    mockFindFreePlanAccount.mockResolvedValue({ accountId: "acc-free" });

    const response = await refuseOnFreePlan("workspace-1");

    expect(mockFindFreePlanAccount).toHaveBeenCalledWith("workspace-1");
    expect(response?.status).toBe(402);
    const body = await response!.json();
    expect(body.code).toBe("free_plan");
    expect(body.details).toMatchObject({ reason: "free_plan", recommendedAction: "plan_request", accountId: "acc-free" });
  });

  it("refuseOnFreePlan is null off the free plan (paid, classic, pilot off): the route goes on", async () => {
    expect(await refuseOnFreePlan("workspace-1")).toBeNull();
    expect(mockApiError).not.toHaveBeenCalled();
  });

  it("creditBlockedApiError on the free plan is the same answer as freePlanApiError (one shared answer)", async () => {
    mockFindFreePlanAccount.mockResolvedValue({ accountId: "acc-free" });
    const viaBlocked = await creditBlockedApiError("workspace-1", "insufficientCredits");
    const viaGuard = await refuseOnFreePlan("workspace-1");

    expect(await viaBlocked.json()).toEqual(await viaGuard!.json());
  });
});
