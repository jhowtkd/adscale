import { describe, expect, it } from "vitest";
import { shouldAutoRetryDerivation } from "@/server/ai/derivation-auto-retry-policy";

describe("shouldAutoRetryDerivation", () => {
  it.each([
    "cta_drift",
    "unreadable_required_text",
    "visual_overload",
    "decorative_only_variation",
  ] as const)("does not retry advisory finding %s", (code) => {
    expect(shouldAutoRetryDerivation("art_variation", [{ code, message: code }], false)).toBe(false);
  });

  it.each(["invented_factual_entity", "unsupported_offer", "wrong_brand"] as const)(
    "retries objective failure %s once",
    (code) => {
      expect(shouldAutoRetryDerivation("art_variation", [{ code, message: code }], false)).toBe(true);
      expect(shouldAutoRetryDerivation("art_variation", [{ code, message: code }], true)).toBe(false);
    }
  );

  it.each(["art_variation", "format_adaptation", "restyling"] as const)(
    "retries objective failures regardless of generation mode (%s)",
    (mode) => {
      expect(
        shouldAutoRetryDerivation(
          mode,
          [{ code: "style_reference_contamination", message: "Style facts leaked" }],
          false
        )
      ).toBe(true);
    }
  );

  it("retries format_adaptation on invalid_format_layout", () => {
    expect(
      shouldAutoRetryDerivation(
        "format_adaptation",
        [{ code: "invalid_format_layout", message: "Layout invalid" }],
        false
      )
    ).toBe(true);
  });

  it("retries on cropped_critical_content and replaced_source_subject", () => {
    expect(
      shouldAutoRetryDerivation(
        "art_variation",
        [{ code: "cropped_critical_content", message: "Cropped" }],
        false
      )
    ).toBe(true);
    expect(
      shouldAutoRetryDerivation(
        "restyling",
        [{ code: "replaced_source_subject", message: "Replaced subject" }],
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
      shouldAutoRetryDerivation("art_variation", [{ code: "wrong_brand", message: "Wrong brand" }], true)
    ).toBe(false);
  });

  it("normalizes copied_style_reference_facts to retry eligibility", () => {
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

  it("does not retry when there are no hard failures", () => {
    expect(shouldAutoRetryDerivation("art_variation", [], false)).toBe(false);
    expect(shouldAutoRetryDerivation("art_variation", null, false)).toBe(false);
  });
});
