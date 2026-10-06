import { describe, expect, it } from "vitest";
import { conversionPayloadOf, parseConversionErrorPayload } from "./conversion-contract";

describe("parseConversionErrorPayload", () => {
  it("parses a structured 402 details payload", () => {
    const payload = parseConversionErrorPayload({
      reason: "beta_exhausted",
      recommendedAction: "checkout",
      suggestedPlan: "starter",
      amount: 15,
      balance: 0,
      returnPath: "/campaigns/c1",
      analytics: {
        reasonCode: "beta_exhausted",
        estimateCredits: 15,
        operation: "batch",
      },
    });

    expect(payload).toEqual({
      reason: "beta_exhausted",
      recommendedAction: "checkout",
      suggestedPlan: "starter",
      amount: 15,
      balance: 0,
      returnPath: "/campaigns/c1",
      analytics: {
        reasonCode: "beta_exhausted",
        estimateCredits: 15,
        operation: "batch",
      },
    });
  });

  it("rejects malformed payloads", () => {
    expect(parseConversionErrorPayload(null)).toBeNull();
    expect(parseConversionErrorPayload({ reason: "unknown" })).toBeNull();
  });
});

const freePlanPayload = {
  reason: "free_plan",
  recommendedAction: "plan_request",
  accountId: "acc-free",
  amount: 50,
  balance: 500,
  analytics: { reasonCode: "free_plan", estimateCredits: 50 },
};

describe("the free plan payload (ticket 11, part 2)", () => {
  it("parses free_plan with plan_request and keeps the account", () => {
    expect(parseConversionErrorPayload(freePlanPayload)).toEqual({ ...freePlanPayload, returnPath: undefined });
  });

  it("refuses plan_request without an account (there would be no CTA to show)", () => {
    const without: Partial<typeof freePlanPayload> = { ...freePlanPayload };
    delete without.accountId;
    expect(parseConversionErrorPayload(without)).toBeNull();
    expect(parseConversionErrorPayload({ ...freePlanPayload, accountId: "" })).toBeNull();
    expect(parseConversionErrorPayload({ ...freePlanPayload, accountId: 7 })).toBeNull();
  });

  it("does not add an accountId to the classic payloads", () => {
    const parsed = parseConversionErrorPayload({
      reason: "beta_exhausted",
      recommendedAction: "checkout",
      amount: 1,
      balance: 0,
      analytics: { reasonCode: "beta_exhausted", estimateCredits: 1 },
    });
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty("accountId");
  });
});

describe("conversionPayloadOf", () => {
  it("reads the payload itself", () => {
    expect(conversionPayloadOf(freePlanPayload)?.reason).toBe("free_plan");
  });

  it("reads a payload wrapped in a spend result", () => {
    expect(conversionPayloadOf({ conversionPayload: freePlanPayload })).toMatchObject({
      reason: "free_plan",
      accountId: "acc-free",
    });
  });

  it("answers null for anything else", () => {
    expect(conversionPayloadOf(undefined)).toBeNull();
    expect(conversionPayloadOf(null)).toBeNull();
    expect(conversionPayloadOf("free_plan")).toBeNull();
    expect(conversionPayloadOf(42)).toBeNull();
    expect(conversionPayloadOf({})).toBeNull();
    expect(conversionPayloadOf({ conversionPayload: "x" })).toBeNull();
    expect(conversionPayloadOf({ reason: "free_plan", accountId: "acc-free" })).toBeNull();
    expect(conversionPayloadOf({ conversionPayload: { reason: "free_plan", recommendedAction: "plan_request" } })).toBeNull();
  });
});
