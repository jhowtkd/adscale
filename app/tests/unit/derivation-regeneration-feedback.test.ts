import { describe, it, expect } from "vitest";
import { buildRegenerationFeedback } from "@/lib/derivation-regeneration-feedback";

describe("buildRegenerationFeedback", () => {
  it("prefers regenerationSuggestion from API", () => {
    expect(
      buildRegenerationFeedback({
        regenerationSuggestion: "Hard failures: [cta_missing]. Fix CTA.",
        hardFailures: [{ code: "cta_missing", message: "CTA not visible" }],
      })
    ).toBe("Hard failures: [cta_missing]. Fix CTA.");
  });

  it("concatenates hard failure codes and messages when suggestion absent", () => {
    expect(
      buildRegenerationFeedback({
        hardFailures: [
          { code: "cta_missing", message: "CTA not visible" },
          { code: "format_mismatch", message: "Wrong aspect ratio" },
        ],
      })
    ).toBe("cta_missing: CTA not visible\nformat_mismatch: Wrong aspect ratio");
  });

  it("returns empty string when no feedback sources exist", () => {
    expect(buildRegenerationFeedback({})).toBe("");
  });
});
