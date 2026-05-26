import { z } from "zod";

export const confidenceLevelSchema = z.enum(["high", "medium", "low"]);

export const aiDeducedFieldSchema = z.object({
  value: z.string().optional(),
  confidence: confidenceLevelSchema.default("medium"),
});

export const aiDeducedFieldsSchema = z.object({
  product: aiDeducedFieldSchema.optional(),
  objective: aiDeducedFieldSchema.optional(),
  targetAudience: aiDeducedFieldSchema.optional(),
  tone: aiDeducedFieldSchema.optional(),
  offer: aiDeducedFieldSchema.optional(),
  platforms: z.object({
    value: z.array(z.string()).optional(),
    confidence: confidenceLevelSchema.default("medium"),
  }).optional(),
  analyzedAt: z.string().datetime().optional(),
});

export type ConfidenceLevel = z.infer<typeof confidenceLevelSchema>;
export type AiDeducedField = z.infer<typeof aiDeducedFieldSchema>;
export type AiDeducedFields = z.infer<typeof aiDeducedFieldsSchema>;
