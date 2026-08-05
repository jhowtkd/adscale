import { z } from "zod";
import { DETERMINISTIC_MEASUREMENT_VERSION } from "./measure-image";

export const BRAND_TRAINING_CATEGORIES = [
  "logo",
  "graphic",
  "character",
  "visual_reference",
] as const;
export const BRAND_TRAINING_USAGE_MODES = ["exact", "reference", "rule"] as const;
export const BRAND_TRAINING_REVIEW_STATUSES = [
  "pending_analysis",
  "pending_approval",
  "approved",
  "archived",
] as const;

export type BrandTrainingCategory = (typeof BRAND_TRAINING_CATEGORIES)[number];
export type BrandTrainingUsageMode = (typeof BRAND_TRAINING_USAGE_MODES)[number];
export type BrandTrainingReviewStatus = (typeof BRAND_TRAINING_REVIEW_STATUSES)[number];

const colorCoverageSchema = z.object({
  hex: z.string(),
  label: z.string().optional(),
  coveragePercent: z.number(),
});

const regionStatsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  meanLuminance: z.number(),
  contrast: z.number(),
});

/** Versioned deterministic metrics. Older analyses without this field still load. */
export const deterministicMeasurementSchema = z.object({
  version: z.literal(DETERMINISTIC_MEASUREMENT_VERSION),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  aspectRatio: z.number().positive(),
  orientationApplied: z.number().nullable(),
  colorSpace: z.string().nullable(),
  hasAlphaChannel: z.boolean(),
  hasRealTransparency: z.boolean(),
  transparentAreaPercent: z.number(),
  colorCoverage: z.array(colorCoverageSchema),
  /** Present on measurements after nearest-assignment; older rows omit it. */
  unassignedPercent: z.number().optional(),
  contentBoundingBox: z
    .object({
      left: z.number(),
      top: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .nullable(),
  margins: z
    .object({
      left: z.number(),
      top: z.number(),
      right: z.number(),
      bottom: z.number(),
    })
    .nullable(),
  meanLuminance: z.number(),
  regions: z.array(regionStatsSchema),
  measuredAt: z.string(),
});

export const brandTrainingAnalysisSchema = z.object({
  description: z.string().trim().min(1).max(1000),
  visualAttributes: z.array(z.string().trim().min(1).max(120)).max(20),
  rules: z.array(z.string().trim().min(1).max(240)).max(20),
  constraints: z.array(z.string().trim().min(1).max(240)).max(20),
  confidence: z.number().min(0).max(1),
  /** Optional — assets analyzed before measurement still validate. */
  measurement: deterministicMeasurementSchema.optional(),
});

export type BrandTrainingAnalysis = z.infer<typeof brandTrainingAnalysisSchema>;

/**
 * Merge a fresh measurement into analysis without clobbering human-edited prose.
 * Reanalysis is idempotent on the measurement block only.
 */
export function mergeMeasurementIntoAnalysis(
  analysis: BrandTrainingAnalysis,
  measurement: z.infer<typeof deterministicMeasurementSchema>,
): BrandTrainingAnalysis {
  return { ...analysis, measurement };
}

export const reviewTrainingAssetSchema = z
  .object({
    trainingCategory: z.enum(BRAND_TRAINING_CATEGORIES),
    usageMode: z.enum(BRAND_TRAINING_USAGE_MODES),
    // Archive may omit analysis (auto-approved uploads often have none yet).
    analysis: brandTrainingAnalysisSchema.nullable().optional(),
    reviewStatus: z.enum(["approved", "archived"]),
  })
  .superRefine((value, ctx) => {
    if (value.reviewStatus === "approved" && value.analysis == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["analysis"],
        message: "Approved training assets require analysis",
      });
    }
  });
