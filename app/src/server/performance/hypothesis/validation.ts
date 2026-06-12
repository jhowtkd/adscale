import { z } from "zod";
import { PERFORMANCE_PLATFORMS } from "../types";
import {
  HYPOTHESIS_EXPECTED_DIRECTIONS,
  HYPOTHESIS_KINDS,
  HYPOTHESIS_PRIMARY_METRICS,
  HYPOTHESIS_VARIANT_ROLES,
} from "./types";

const variantInputSchema = z.object({
  derivationId: z.string().uuid(),
  role: z.enum(HYPOTHESIS_VARIANT_ROLES),
  label: z.string().max(200).optional().nullable(),
});

export const createHypothesisSchema = z.object({
  title: z.string().max(200).optional().nullable(),
  variableKey: z.string().min(1).max(100),
  primaryMetric: z.enum(HYPOTHESIS_PRIMARY_METRICS),
  expectedDirection: z.enum(HYPOTHESIS_EXPECTED_DIRECTIONS),
  rationale: z.string().min(1).max(5000),
  kind: z.enum(HYPOTHESIS_KINDS).default("controlled_hypothesis"),
  platform: z.enum(PERFORMANCE_PLATFORMS).optional().nullable(),
  periodStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  periodEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  variants: z.array(variantInputSchema).min(2),
});

export const updateHypothesisSchema = createHypothesisSchema.partial();

export const observationalComparisonSchema = z.object({
  primaryMetric: z.enum(HYPOTHESIS_PRIMARY_METRICS),
  platform: z.enum(PERFORMANCE_PLATFORMS).optional().nullable(),
  periodStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  periodEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  derivationIds: z.array(z.string().uuid()).min(2),
});

export type CreateHypothesisInput = z.infer<typeof createHypothesisSchema>;
export type UpdateHypothesisInput = z.infer<typeof updateHypothesisSchema>;
export type ObservationalComparisonInput = z.infer<
  typeof observationalComparisonSchema
>;
