import { describe, it, expect } from "vitest";
import {
  buildMissionInsightDiagnosticContext,
  sanitizeMissionInsightInput,
  sanitizeOptionalText,
} from "./sanitize";

describe("sanitizeMissionInsightInput", () => {
  it("accepts a submitted insight with sentiment and reason", () => {
    const result = sanitizeMissionInsightInput({
      moment: "preview_first",
      missionKey: "preview",
      sentiment: "positive",
      reason: "clear_value",
      optionalText: "Loved the quick preview",
      action: "submitted",
      diagnosticContext: {
        isPreview: true,
        prompt: "secret prompt text",
        authToken: "sk-live-abc",
      },
    });

    expect(result).toMatchObject({
      moment: "preview_first",
      missionKey: "preview",
      sentiment: "positive",
      reason: "clear_value",
      action: "submitted",
    });
    expect(result?.safeDiagnostic).toEqual({ isPreview: true });
    expect(result?.safeDiagnostic.prompt).toBeUndefined();
  });

  it("allows dismissed insights without sentiment", () => {
    const result = sanitizeMissionInsightInput({
      moment: "readiness_first",
      missionKey: "readiness",
      action: "dismissed",
    });

    expect(result?.action).toBe("dismissed");
    expect(result?.sentiment).toBeUndefined();
  });

  it("rejects submitted insights missing sentiment", () => {
    const result = sanitizeMissionInsightInput({
      moment: "rejection_first",
      missionKey: "review",
      reason: "quality_issue",
      action: "submitted",
    });

    expect(result).toBeNull();
  });

  it("rejects unknown mission keys", () => {
    const result = sanitizeMissionInsightInput({
      moment: "preview_first",
      missionKey: "not_a_real_mission",
      action: "dismissed",
    });

    expect(result).toBeNull();
  });

  it("truncates long optional text", () => {
    const long = "x".repeat(600);
    expect(sanitizeOptionalText(long)?.length).toBe(501);
  });
});

describe("buildMissionInsightDiagnosticContext", () => {
  it("tags mission insight source and strips sensitive keys", () => {
    const insight = sanitizeMissionInsightInput({
      moment: "credit_friction",
      missionKey: "preview",
      sentiment: "negative",
      reason: "cost_concern",
      action: "submitted",
      diagnosticContext: {
        creditError: "insufficientCredits",
        apiKey: "should-not-appear",
      },
    });

    expect(insight).not.toBeNull();
    const context = buildMissionInsightDiagnosticContext(insight!);
    expect(context.source).toBe("mission_insight");
    expect(context.moment).toBe("credit_friction");
    expect(context.creditError).toBe("insufficientCredits");
    expect(context.apiKey).toBeUndefined();
  });
});
