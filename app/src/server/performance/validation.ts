import { z } from "zod";
import {
  PERFORMANCE_PLATFORMS,
  PERFORMANCE_SOURCE_TYPES,
} from "./types";

const decimalSchema = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, "Must be a non-negative decimal");

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");
const optionalIdSchema = z.string().trim().min(1).max(255).nullish();
const boundedMetadataSchema = z.record(z.unknown()).refine(
  (value) => JSON.stringify(value).length <= 16_384,
  "Metadata must be at most 16 KB"
);

const totalScopeSchema = z.object({ kind: z.literal("total") }).strict();
const segmentScopeSchema = z
  .object({
    kind: z.literal("segment"),
    dimensions: z
      .record(z.string().trim().min(1).max(255))
      .refine((value) => Object.keys(value).length > 0, "Segment needs dimensions")
      .refine((value) => Object.keys(value).length <= 20, "Too many dimensions"),
  })
  .strict();

export const canonicalPerformanceSnapshotInputSchema = z
  .object({
    campaignId: z.string().uuid(),
    derivationId: z.string().uuid(),
    platform: z.enum(PERFORMANCE_PLATFORMS),
    placementRaw: z.string().trim().min(1).max(255),
    adAccountId: optionalIdSchema,
    startDate: dateSchema,
    endDate: dateSchema,
    sourceTimezone: z.string().trim().min(1).max(100),
    currency: z.string().trim().regex(/^[A-Z]{3}$/, "Currency must be uppercase ISO code"),
    sourceType: z.enum(PERFORMANCE_SOURCE_TYPES),
    externalCampaignId: optionalIdSchema,
    externalAdGroupId: optionalIdSchema,
    externalAdId: optionalIdSchema,
    scope: z.discriminatedUnion("kind", [totalScopeSchema, segmentScopeSchema]),
    sourceMetadata: boundedMetadataSchema.optional(),
    metrics: z
      .object({
        impressions: decimalSchema,
        clicks: decimalSchema,
        spend: decimalSchema,
        conversions: decimalSchema,
        conversionValue: decimalSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.endDate < value.startDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date must be on or after start date",
      });
    }

    if (BigInt(value.metrics.clicks.split(".")[0]) > BigInt(value.metrics.impressions.split(".")[0])) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["metrics", "clicks"],
        message: "Clicks cannot exceed impressions",
      });
    }
  });

export type CanonicalPerformanceSnapshotInput = z.infer<
  typeof canonicalPerformanceSnapshotInputSchema
>;
