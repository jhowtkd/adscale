import { describe, expect, it } from "vitest";
import {
  mergeMeasurementIntoAnalysis,
  mergeStructureIntoAnalysis,
  reviewTrainingAssetSchema,
  type BrandTrainingAnalysis,
} from "./contracts";
import type { VisionStructure } from "./vision-structure";

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

  it("keeps measurement and structure as separate optional blocks", () => {
    const parsed = reviewTrainingAssetSchema.parse({
      trainingCategory: "visual_reference",
      usageMode: "reference",
      reviewStatus: "approved",
      analysis: {
        description: "Card modular PreceptorIA",
        visualAttributes: ["navy", "yellow accent"],
        rules: ["Keep modular card family"],
        constraints: [],
        confidence: 0.9,
        measurement: {
          version: 1,
          width: 1080,
          height: 1350,
          aspectRatio: 0.8,
          orientationApplied: null,
          colorSpace: "srgb",
          hasAlphaChannel: false,
          hasRealTransparency: false,
          transparentAreaPercent: 0,
          colorCoverage: [{ hex: "#071522", coveragePercent: 80 }],
          contentBoundingBox: null,
          margins: null,
          meanLuminance: 0.1,
          regions: [],
          measuredAt: "2026-08-05T00:00:00.000Z",
        },
        structure: {
          version: 1,
          source: "vision",
          inferredAt: "2026-08-05T00:00:00.000Z",
          zones: null,
          archetype: { id: "modular_card", confidence: 0.9 },
          typography: null,
          grid: null,
          media: null,
          contentPattern: null,
          accentPlacement: null,
          authenticityRisk: null,
          overallConfidence: 0.8,
        },
      },
    });
    expect(parsed.analysis?.measurement?.colorCoverage[0]?.coveragePercent).toBe(80);
    expect(parsed.analysis?.structure?.archetype?.id).toBe("modular_card");
    // Measured quantities live only under measurement.
    expect(
      JSON.stringify(parsed.analysis?.structure).includes("coveragePercent"),
    ).toBe(false);
  });

  it("does not overwrite human-locked structure on merge", () => {
    const human: BrandTrainingAnalysis = {
      description: "Human edited",
      visualAttributes: [],
      rules: [],
      constraints: [],
      confidence: 1,
      structure: {
        version: 1,
        source: "human",
        inferredAt: "2026-08-01T00:00:00.000Z",
        zones: null,
        archetype: { id: "text_led_card", confidence: 1 },
        typography: null,
        grid: null,
        media: null,
        contentPattern: null,
        accentPlacement: null,
        authenticityRisk: null,
        overallConfidence: 1,
      },
    };
    const incoming: VisionStructure = {
      version: 1,
      source: "vision",
      inferredAt: "2026-08-05T00:00:00.000Z",
      zones: null,
      archetype: { id: "modular_card", confidence: 0.9 },
      typography: null,
      grid: null,
      media: null,
      contentPattern: null,
      accentPlacement: null,
      authenticityRisk: null,
      overallConfidence: 0.9,
    };
    const merged = mergeStructureIntoAnalysis(human, incoming);
    expect(merged.structure?.source).toBe("human");
    expect(merged.structure?.archetype?.id).toBe("text_led_card");
  });

  it("mergeMeasurement does not touch structure", () => {
    const base: BrandTrainingAnalysis = {
      description: "x",
      visualAttributes: [],
      rules: [],
      constraints: [],
      confidence: 0.5,
      structure: {
        version: 1,
        source: "vision",
        inferredAt: "t",
        zones: null,
        archetype: { id: "other", confidence: 0.5 },
        typography: null,
        grid: null,
        media: null,
        contentPattern: null,
        accentPlacement: null,
        authenticityRisk: null,
        overallConfidence: 0.5,
      },
    };
    const withM = mergeMeasurementIntoAnalysis(base, {
      version: 1,
      width: 10,
      height: 10,
      aspectRatio: 1,
      orientationApplied: null,
      colorSpace: "srgb",
      hasAlphaChannel: false,
      hasRealTransparency: false,
      transparentAreaPercent: 0,
      colorCoverage: [],
      contentBoundingBox: null,
      margins: null,
      meanLuminance: 0,
      regions: [],
      measuredAt: "t",
    });
    expect(withM.structure?.archetype?.id).toBe("other");
    expect(withM.measurement?.width).toBe(10);
  });
});
