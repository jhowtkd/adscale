import { describe, expect, it } from "vitest";
import {
  brandTrainingAnalysisSchema,
  mergeMeasurementIntoAnalysis,
  mergeStructureIntoAnalysis,
  preserveHumanStructure,
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

  it("accepts the person category with reference mode only", () => {
    const approved = reviewTrainingAssetSchema.parse({
      trainingCategory: "person",
      usageMode: "reference",
      analysis: {
        description: "Retrato da porta-voz para referência de identidade.",
        visualAttributes: ["portrait"],
        rules: [],
        constraints: [],
        confidence: 0.8,
      },
      reviewStatus: "approved",
    });
    expect(approved.trainingCategory).toBe("person");
    // People are never exact-composited like logos and never a textual rule.
    for (const usageMode of ["exact", "rule"] as const) {
      expect(() =>
        reviewTrainingAssetSchema.parse({
          trainingCategory: "person",
          usageMode,
          analysis: null,
          reviewStatus: "approved",
        }),
      ).toThrow();
    }
  });

  it("keeps the character category for legacy mascots", () => {
    const parsed = reviewTrainingAssetSchema.parse({
      trainingCategory: "character",
      usageMode: "exact",
      analysis: null,
      reviewStatus: "approved",
    });
    expect(parsed.trainingCategory).toBe("character");
  });

  it("parses a status-only legacy confirmation for contextual route validation", () => {
    const parsed = reviewTrainingAssetSchema.parse({
      trainingCategory: "logo",
      usageMode: "exact",
      analysis: null,
      reviewStatus: "approved",
    });
    expect(parsed.analysis).toBeNull();
  });

  it("accepts archive without analysis (legacy uploads)", () => {
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

  it("requires a structured reason for rejected evidence", () => {
    const parsed = reviewTrainingAssetSchema.parse({
      trainingCategory: "visual_reference",
      usageMode: "reference",
      analysis: null,
      reviewStatus: "rejected",
      rejectionReason: { code: "brand_drift", note: "Fora da identidade" },
    });

    expect(parsed.reviewStatus).toBe("rejected");
    expect(parsed.rejectionReason?.code).toBe("brand_drift");
    expect(() =>
      reviewTrainingAssetSchema.parse({
        trainingCategory: "visual_reference",
        usageMode: "reference",
        analysis: null,
        reviewStatus: "rejected",
      }),
    ).toThrow();
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

  it("preserveHumanStructure is the sole human-lock owner after a null vision parse", () => {
    const prior: BrandTrainingAnalysis = {
      description: "prior",
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
    const next: BrandTrainingAnalysis = {
      description: "fresh vision prose",
      visualAttributes: ["x"],
      rules: [],
      constraints: [],
      confidence: 0.5,
    };
    const cleared = mergeStructureIntoAnalysis(next, null);
    expect(cleared.structure).toBeUndefined();
    const kept = preserveHumanStructure(cleared, prior);
    expect(kept.structure?.source).toBe("human");
    expect(kept.structure?.archetype?.id).toBe("text_led_card");
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

  it("keeps legacy analyses readable and accepts relational observations", () => {
    const legacy = {
      description: "Peça antiga sem camada de repertório.",
      visualAttributes: ["título"],
      rules: ["Dar escala ao título"],
      constraints: ["Não competir focos"],
      confidence: 0.8,
    };
    expect(brandTrainingAnalysisSchema.parse(legacy)).not.toHaveProperty("compositionalRelations");
    const parsed = brandTrainingAnalysisSchema.parse({
      ...legacy,
      compositionalRelations: [{
        dimension: "hierarchy",
        observation: "Título domina a leitura com respiro ao redor",
        application: "Dar ao título escala superior ao texto de apoio",
      }],
    });
    expect(parsed.compositionalRelations).toHaveLength(1);
    expect(brandTrainingAnalysisSchema.safeParse({
      ...legacy,
      compositionalRelations: [{ dimension: "unknown", observation: "x", application: "y" }],
    }).success).toBe(false);
  });
});
