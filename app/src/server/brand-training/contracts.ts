import { z } from "zod";
import { DETERMINISTIC_MEASUREMENT_VERSION } from "./measure-image";
import {
  visionStructureReadSchema,
  visionStructureSchema,
  type VisionStructure,
} from "./vision-structure";

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
  /**
   * Deterministic Sharp metrics only. Never store vision labels here.
   * Optional — assets analyzed before measurement still validate.
   */
  measurement: deterministicMeasurementSchema.optional(),
  /**
   * Vision/structure inference only. Never store measured quantities here.
   * Optional — assets analyzed before structure layer still validate.
   * Read-lenient so legacy free-text `inferredAt` still loads (write path is strict).
   */
  structure: visionStructureReadSchema.optional(),
});

export type BrandTrainingAnalysis = z.infer<typeof brandTrainingAnalysisSchema>;

/** Minimal prior shape needed to keep a human lock across reanalysis. */
export type PriorStructureHolder = {
  structure?: z.infer<typeof visionStructureReadSchema>;
} | null | undefined;

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

/**
 * Apply a new vision structure (or clear it). Does not enforce human lock —
 * call `preserveHumanStructure` after this so a null parse cannot wipe humans.
 */
export function mergeStructureIntoAnalysis(
  analysis: BrandTrainingAnalysis,
  structure: VisionStructure | null,
): BrandTrainingAnalysis {
  if (structure == null) {
    const { structure: _drop, ...rest } = analysis;
    return rest;
  }
  // Write-strict: normalize to datetime Z before persist.
  return { ...analysis, structure: visionStructureSchema.parse(structure) };
}

/**
 * Carry forward a human-locked structure from a prior analysis onto a fresh one.
 * Call this even when the new vision parse failed (null), so reanalysis never
 * silently wipes a human correction. Sole owner of the human-lock invariant.
 */
export function preserveHumanStructure(
  next: BrandTrainingAnalysis,
  prior: PriorStructureHolder,
): BrandTrainingAnalysis {
  if (prior?.structure?.source !== "human") return next;
  return { ...next, structure: prior.structure };
}

export const reviewTrainingAssetSchema = z
  .object({
    trainingCategory: z.enum(BRAND_TRAINING_CATEGORIES),
    usageMode: z.enum(BRAND_TRAINING_USAGE_MODES),
    // Archive may omit analysis for legacy uploads without an AI proposal.
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
