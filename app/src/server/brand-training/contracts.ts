import { z } from "zod";

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

export const brandTrainingAnalysisSchema = z.object({
  description: z.string().trim().min(1).max(1000),
  visualAttributes: z.array(z.string().trim().min(1).max(120)).max(20),
  rules: z.array(z.string().trim().min(1).max(240)).max(20),
  constraints: z.array(z.string().trim().min(1).max(240)).max(20),
  confidence: z.number().min(0).max(1),
});

export type BrandTrainingAnalysis = z.infer<typeof brandTrainingAnalysisSchema>;

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
