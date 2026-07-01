import { describe, it, expect } from "vitest";
import {
  buildRegenerationFeedback,
  derivationNeedsRegenerateDialog,
} from "@/lib/derivation-display";

describe("buildRegenerationFeedback", () => {
  it("prefers regenerationSuggestion from API", () => {
    const result = buildRegenerationFeedback({
      regenerationSuggestion: "Hard failures: [cta_missing]. Fix CTA.",
      hardFailures: [{ code: "cta_missing", message: "CTA not visible" }],
    });
    expect(result.feedbackText).toBe("Hard failures: [cta_missing]. Fix CTA.");
  });

  it("concatenates hard failure codes and messages when suggestion absent", () => {
    const result = buildRegenerationFeedback({
      hardFailures: [
        { code: "cta_missing", message: "CTA not visible" },
        { code: "format_mismatch", message: "Wrong aspect ratio" },
      ],
    });
    expect(result.feedbackText).toBe(
      "cta_missing: CTA not visible\nformat_mismatch: Wrong aspect ratio"
    );
  });

  it("returns empty feedback when no feedback sources exist", () => {
    expect(buildRegenerationFeedback({}).feedbackText).toBe("");
  });

  it("passes through server preview fields", () => {
    const result = buildRegenerationFeedback({
      regenerationPrimaryReason: "cta_drift",
      regenerationIssueBreakdown: {
        hardFailures: [{ code: "cta_drift", message: "Missing" }],
        scoreIssues: [],
        qaFailed: [],
        qaWarnings: [],
      },
    });
    expect(result.primaryReason).toBe("cta_drift");
    expect(result.issueBreakdown?.hardFailures).toHaveLength(1);
  });
});

describe("derivationNeedsRegenerateDialog", () => {
  it("requires dialog for hard failures and invalid verdict", () => {
    expect(
      derivationNeedsRegenerateDialog({
        hardFailures: [{ code: "cta_drift", message: "x" }],
      })
    ).toBe(true);
    expect(derivationNeedsRegenerateDialog({ qualityVerdict: "invalid" })).toBe(true);
    expect(derivationNeedsRegenerateDialog({})).toBe(false);
  });
});
