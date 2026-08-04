import { describe, expect, it } from "vitest";
import { reviewTrainingAssetSchema } from "./contracts";

describe("brand training contracts", () => {
  it("accepts the four V1 categories and three usage modes", () => {
    const parsed = reviewTrainingAssetSchema.parse({
      trainingCategory: "graphic",
      usageMode: "reference",
      analysis: {
        description: "Ondas verdes usadas como moldura.",
        visualAttributes: ["green", "rounded"],
        rules: ["Preserve aspect ratio"],
        constraints: ["Do not recolor"],
        confidence: 0.91,
      },
      reviewStatus: "approved",
    });

    expect(parsed.trainingCategory).toBe("graphic");
    expect(parsed.usageMode).toBe("reference");
  });

  it("rejects approval without a completed analysis", () => {
    expect(() =>
      reviewTrainingAssetSchema.parse({
        trainingCategory: "logo",
        usageMode: "exact",
        analysis: null,
        reviewStatus: "approved",
      }),
    ).toThrow();
  });

  it("accepts archive without analysis (auto-approved uploads)", () => {
    const parsed = reviewTrainingAssetSchema.parse({
      trainingCategory: "visual_reference",
      usageMode: "reference",
      analysis: null,
      reviewStatus: "archived",
    });
    expect(parsed.reviewStatus).toBe("archived");
    expect(parsed.analysis).toBeNull();
  });

  it("accepts archive omitting analysis entirely", () => {
    const parsed = reviewTrainingAssetSchema.parse({
      trainingCategory: "visual_reference",
      usageMode: "reference",
      reviewStatus: "archived",
    });
    expect(parsed.reviewStatus).toBe("archived");
  });
});
