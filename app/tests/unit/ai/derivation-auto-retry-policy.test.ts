import { describe, expect, it } from "vitest";
import { shouldAutoRetryDerivation } from "@/server/ai/derivation-auto-retry-policy";

describe("shouldAutoRetryDerivation", () => {
  it("retries restyling on style_reference_contamination when not yet attempted", () => {
    expect(
      shouldAutoRetryDerivation(
        "restyling",
        [{ code: "style_reference_contamination", message: "Style facts leaked" }],
        false
      )
    ).toBe(true);
  });

  it("does not retry restyling on invented_factual_entity", () => {
    expect(
      shouldAutoRetryDerivation(
        "restyling",
        [{ code: "invented_factual_entity", message: "Invented entity" }],
        false
      )
    ).toBe(false);
  });

  it("retries art_variation on decorative_only_variation", () => {
    expect(
      shouldAutoRetryDerivation(
        "art_variation",
        [{ code: "decorative_only_variation", message: "Decorative only" }],
        false
      )
    ).toBe(true);
  });

  it("retries format_adaptation on invalid_format_layout", () => {
    expect(
      shouldAutoRetryDerivation(
        "format_adaptation",
        [{ code: "invalid_format_layout", message: "Layout invalid" }],
        false
      )
    ).toBe(true);
  });

  it("skips when auto retry already attempted for all modes", () => {
    expect(
      shouldAutoRetryDerivation(
        "restyling",
        [{ code: "style_reference_contamination", message: "Style facts leaked" }],
        true
      )
    ).toBe(false);
    expect(
      shouldAutoRetryDerivation("art_variation", [{ code: "cta_drift", message: "CTA mismatch" }], true)
    ).toBe(false);
  });

  it("normalizes copied_style_reference_facts to restyling retry eligibility", () => {
    expect(
      shouldAutoRetryDerivation(
        "restyling",
        [{ code: "copied_style_reference_facts", message: "Copied style facts" }],
        false
      )
    ).toBe(true);
  });

  it("does not retry campaign_identity_drift for any mode", () => {
    expect(
      shouldAutoRetryDerivation(
        "format_adaptation",
        [{ code: "campaign_identity_drift", message: "Campaign drift" }],
        false
      )
    ).toBe(false);
  });

  it("retries on cta_drift for art_variation when not yet attempted", () => {
    expect(
      shouldAutoRetryDerivation("art_variation", [{ code: "cta_drift", message: "CTA mismatch" }], false)
    ).toBe(true);
  });

  it("skips non-retryable failures", () => {
    expect(
      shouldAutoRetryDerivation("art_variation", [{ code: "wrong_brand", message: "Wrong brand" }], false)
    ).toBe(false);
  });
});
