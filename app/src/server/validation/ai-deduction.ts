import { z } from "zod";

const confidenceLevelSchema = z.enum(["high", "medium", "low"]);

const aiDeducedFieldSchema = z.object({
  value: z.string().optional(),
  confidence: confidenceLevelSchema.default("medium"),
});

const aiSuggestionSchema = z.object({
  suggestedCreativeLevel: z.object({
    value: z.enum(["conservative", "balanced", "bold"]),
    confidence: confidenceLevelSchema.default("medium"),
    reasoning: z.string().optional(),
  }).optional(),
  suggestedCtas: z.array(z.object({
    value: z.string(),
    confidence: confidenceLevelSchema.default("medium"),
  })).max(3).optional(),
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
  suggestedCreativeLevel: aiSuggestionSchema.shape.suggestedCreativeLevel.optional(),
  suggestedCtas: aiSuggestionSchema.shape.suggestedCtas.optional(),
  analyzedAt: z.string().datetime().optional(),
});

export type ConfidenceLevel = z.infer<typeof confidenceLevelSchema>;
export type AiDeducedField = z.infer<typeof aiDeducedFieldSchema>;
export type AiSuggestion = z.infer<typeof aiSuggestionSchema>;
export type AiDeducedFields = z.infer<typeof aiDeducedFieldsSchema>;
