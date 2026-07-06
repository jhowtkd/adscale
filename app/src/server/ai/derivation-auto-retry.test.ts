import { describe, expect, it } from "vitest";
import { shouldAutoRetryDerivation } from "./derivation-auto-retry-policy";

describe("shouldAutoRetryDerivation (colocated)", () => {
  it("does not retry advisory cta_drift", () => {
    expect(
      shouldAutoRetryDerivation("art_variation", [{ code: "cta_drift", message: "CTA mismatch" }], false)
    ).toBe(false);
  });

  it("skips when auto retry already attempted", () => {
    expect(
      shouldAutoRetryDerivation("art_variation", [{ code: "wrong_brand", message: "Wrong brand" }], true)
    ).toBe(false);
  });

  it("retries objective failures", () => {
    expect(
      shouldAutoRetryDerivation("art_variation", [{ code: "wrong_brand", message: "Wrong brand" }], false)
    ).toBe(true);
  });
});
