import { describe, expect, it } from "vitest";
import { parseConversionErrorPayload } from "./conversion-contract";

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
