import { describe, it, expect } from "vitest";
import {
  extractPrimaryStructuredReason,
  extractRejectionReason,
  extractRegenerationReason,
} from "@/server/output-learning/output-decision-reasons";

describe("output-decision-reasons", () => {
  it("prefers hard failure code over freeform text", () => {
    const reason = extractRejectionReason({
      hardFailures: [{ code: "invented_factual_entity", message: "Cantona appeared" }],
      regenerationSuggestion: "Try again with simpler layout",
      userFeedback: "Looks wrong",
    });

    expect(reason).toEqual({
      code: "invented_factual_entity",
      text: "Cantona appeared",
      source: "hard_failures",
    });
  });

  it("falls back to score issues when no hard failures", () => {
    const reason = extractRejectionReason({
      hardFailures: [],
      scoreIssues: ["hook illegible at thumbnail scale"],
    });

    expect(reason).toEqual({
      text: "hook illegible at thumbnail scale",
      source: "score_issues",
    });
  });

  it("uses correction brief primary reason for regeneration", () => {
    const reason = extractRegenerationReason({
      correctionPrimaryReason: "Restore factual subject from base image",
      userFeedback: "fix the logo",
    });

    expect(reason).toEqual({
      text: "Restore factual subject from base image",
      source: "correction_brief",
    });
  });

  it("uses feedback category when structured codes absent", () => {
    const reason = extractPrimaryStructuredReason({
      feedbackCategory: "wrong_brand",
    });

    expect(reason).toEqual({
      code: "wrong_brand",
      source: "feedback_category",
    });
  });
});
