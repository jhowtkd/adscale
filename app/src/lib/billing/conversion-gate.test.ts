import { describe, expect, it } from "vitest";
import { buildConversionErrorPayload, resolveConversionGate } from "./conversion-gate";

describe("conversion gate contract", () => {
  it("maps insufficient credits for beta users to checkout", () => {
    const payload = buildConversionErrorPayload({
      check: {
        allowed: false,
        amount: 15,
        balance: 5,
        reason: "insufficient_credits",
      },
      access: {
        kind: "beta",
        creditBalance: 5,
        remainingAds: 1,
        hasSpendAccess: true,
        subscriptionStatus: "none",
      },
      returnPath: "/campaigns/c1",
      operation: "batch",
    });

    expect(payload).toMatchObject({
      reason: "insufficient_credits",
      recommendedAction: "checkout",
      suggestedPlan: "starter",
      returnPath: "/campaigns/c1",
      analytics: {
        reasonCode: "insufficient_credits",
        estimateCredits: 15,
        operation: "batch",
      },
    });
  });

  it("maps beta exhaustion to checkout with campaign return path", () => {
    const payload = buildConversionErrorPayload({
      check: {
        allowed: false,
        amount: 5,
        balance: 0,
        reason: "insufficient_credits",
      },
      access: {
        kind: "beta",
        creditBalance: 0,
        remainingAds: 0,
        hasSpendAccess: true,
        subscriptionStatus: "none",
      },
      returnPath: "/campaigns/c1?tab=generate",
    });

    expect(payload.reason).toBe("beta_exhausted");
    expect(payload.recommendedAction).toBe("checkout");
  });

  it("maps inactive subscription without access to subscription_required", () => {
    const payload = buildConversionErrorPayload({
      check: {
        allowed: false,
        amount: 5,
        balance: 0,
        reason: "inactive_subscription",
      },
      access: {
        kind: "none",
        creditBalance: 0,
        remainingAds: null,
        hasSpendAccess: false,
        subscriptionStatus: "none",
      },
    });

    expect(payload.reason).toBe("subscription_required");
    expect(payload.recommendedAction).toBe("checkout");
  });

  it("maps past_due without spend access to portal recovery", () => {
    const payload = buildConversionErrorPayload({
      check: {
        allowed: false,
        amount: 5,
        balance: 0,
        reason: "inactive_subscription",
      },
      access: {
        kind: "none",
        creditBalance: 0,
        remainingAds: null,
        hasSpendAccess: false,
        subscriptionStatus: "past_due",
      },
    });

    expect(payload.reason).toBe("past_due_recovery");
    expect(payload.recommendedAction).toBe("portal");
  });

  it("maps paid insufficient credits to billing settings", () => {
    const payload = buildConversionErrorPayload({
      check: {
        allowed: false,
        amount: 10,
        balance: 2,
        reason: "insufficient_credits",
      },
      access: {
        kind: "paid",
        creditBalance: 2,
        remainingAds: 0,
        hasSpendAccess: true,
        subscriptionStatus: "active",
      },
    });

    expect(payload.reason).toBe("insufficient_credits");
    expect(payload.recommendedAction).toBe("billing");
  });

  it("returns null when balance covers the batch estimate", () => {
    expect(
      resolveConversionGate({
        creditBalance: 100,
        requiredCredits: 15,
        hasSpendAccess: true,
        accessKind: "beta",
        subscriptionStatus: "none",
        remainingAds: 10,
      })
    ).toBeNull();
  });

  describe("free_plan (ticket 11, part 2)", () => {
    const check = { allowed: false as const, amount: 50, balance: 500, reason: "free_plan" as const, accountId: "acc-free" };

    // The answer never depends on the subscription or the balance: every access shape gives the plan request.
    it.each([
      ["beta with credit", { kind: "beta" as const, creditBalance: 500, remainingAds: 10, hasSpendAccess: true, subscriptionStatus: "none" as const }],
      ["no access", { kind: "none" as const, creditBalance: 0, remainingAds: null, hasSpendAccess: false, subscriptionStatus: "none" as const }],
      ["past due", { kind: "none" as const, creditBalance: 0, remainingAds: null, hasSpendAccess: false, subscriptionStatus: "past_due" as const }],
      ["paid", { kind: "paid" as const, creditBalance: 9, remainingAds: 1, hasSpendAccess: true, subscriptionStatus: "active" as const }],
    ])("answers plan_request with the account, never a checkout (%s)", (_name, access) => {
      const payload = buildConversionErrorPayload({ check, access, returnPath: "/campaigns/c1", operation: "plan" });

      expect(payload).toEqual({
        reason: "free_plan",
        recommendedAction: "plan_request",
        accountId: "acc-free",
        amount: 50,
        balance: 500,
        returnPath: "/campaigns/c1",
        analytics: { reasonCode: "free_plan", estimateCredits: 50, operation: "plan" },
      });
      expect(payload).not.toHaveProperty("suggestedPlan");
    });

    it("classic payloads carry no accountId", () => {
      const payload = buildConversionErrorPayload({
        check: { allowed: false, amount: 5, balance: 0, reason: "insufficient_credits" },
        access: { kind: "beta", creditBalance: 0, remainingAds: 0, hasSpendAccess: true, subscriptionStatus: "none" },
      });
      expect(payload).not.toHaveProperty("accountId");
    });
  });
});
