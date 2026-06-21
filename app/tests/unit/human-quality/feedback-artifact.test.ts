import { describe, it, expect } from "vitest";
import { buildHumanQualityFeedbackArtifactPayload } from "@/server/human-quality/feedback-artifact";

describe("buildHumanQualityFeedbackArtifactPayload", () => {
  it("links evaluation fields and improvement targets without sensitive keys", () => {
    const payload = buildHumanQualityFeedbackArtifactPayload({
      item: {
        id: "item-1",
        cohort: "baseline",
        generationMode: "art_variation",
        format: "1:1",
        corpusVersion: 1,
        qualitySnapshot: { qualityScore: 72, qualityVerdict: "improvable" },
      } as never,
      evaluation: {
        visualScore: 68,
        factualPass: false,
        intent: "reject",
        primaryFailureReason: "weak_hierarchy",
        otherReasonText: null,
      } as never,
    });

    expect(payload.schemaVersion).toBe(1);
    expect(payload.evaluation.visualScore).toBe(68);
    expect(payload.corpusContext.qualityScore).toBe(72);
    expect(payload.improvementTargets).toContain("improve_visual_hierarchy");
    expect(payload.improvementTargets).toContain("address_factual_failure");
    expect(payload).not.toHaveProperty("prompt");
  });
});
