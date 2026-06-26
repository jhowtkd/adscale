import { describe, expect, it } from "vitest";
import {
  assertValidFeedbackRating,
  GuidedFlowFeedbackValidationError,
  sanitizeFeedbackReasonText,
} from "./guided-flow-feedback";

describe("guided-flow-feedback repository helpers", () => {
  it("accepts diagnosis and creative plan ratings", () => {
    expect(() =>
      assertValidFeedbackRating("diagnosis_utility", "useful")
    ).not.toThrow();
    expect(() =>
      assertValidFeedbackRating("creative_plan_readiness", "generation_ready")
    ).not.toThrow();
  });

  it("rejects invalid ratings", () => {
    expect(() =>
      assertValidFeedbackRating("diagnosis_utility", "bad")
    ).toThrow(GuidedFlowFeedbackValidationError);
  });

  it("truncates reason text safely", () => {
    expect(sanitizeFeedbackReasonText("  ok  ")).toBe("ok");
    expect(sanitizeFeedbackReasonText("x".repeat(300))?.length).toBe(256);
  });
});
