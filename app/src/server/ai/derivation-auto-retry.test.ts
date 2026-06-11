import { describe, expect, it } from "vitest";
import { shouldAutoRetryDerivation } from "./derivation-auto-retry-policy";

describe("shouldAutoRetryDerivation", () => {
  it("retries on cta_drift when not yet attempted", () => {
    expect(
      shouldAutoRetryDerivation([{ code: "cta_drift", message: "CTA mismatch" }], false)
    ).toBe(true);
  });

  it("skips when auto retry already attempted", () => {
    expect(
      shouldAutoRetryDerivation([{ code: "cta_drift", message: "CTA mismatch" }], true)
    ).toBe(false);
  });

  it("skips non-retryable failures", () => {
    expect(
      shouldAutoRetryDerivation([{ code: "wrong_brand", message: "Wrong brand" }], false)
    ).toBe(false);
  });
});
