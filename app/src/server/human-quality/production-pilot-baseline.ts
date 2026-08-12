/**
 * Controlled reference for production-pilot baselines (e.g. PreceptorIA).
 * Versioned metadata only — images stay out of git. Anchors on the phase-115
 * human-quality corpus infrastructure without a second parallel baseline system.
 */
import { z } from "zod";

import { HUMAN_QUALITY_SOURCE_LABELS } from "./corpus";

export const PRODUCTION_PILOT_BASELINE_VERSION = 1 as const;

const PRODUCTION_PILOT_PROVENANCE_SOURCES = [
  "production_pilot",
  "manual_capture",
  "replay",
  ...HUMAN_QUALITY_SOURCE_LABELS,
] as const;

const hardFailureSchema = z.enum([
  "instruction_printed_as_copy",
  "logo_absent",
  "prohibited_pattern_present",
  "brand_lettering_wrong",
  "other",
]);

const formatSchema = z.enum(["1:1", "4:5", "9:16", "1.91:1", "16:9"]);

export const productionPilotRequestBaselineSchema = z.object({
  requestId: z.string().min(1),
  requestText: z.string().min(1),
  format: formatSchema,
  /** Content pattern this request exercises. */
  contentPattern: z.enum([
    "text_led_ad",
    "evidence_data",
    "institutional_photo",
  ]),
  /** Effective prompt/spec sent to the provider (text only). */
  effectivePrompt: z.string(),
  effectiveSpecSummary: z.string().optional(),
  /** Selected reference ids and why (today: registration order / slice(0,3)). */
  selectedReferences: z.array(
    z.object({
      referenceId: z.string(),
      reason: z.string(),
    }),
  ),
  source: z.enum(HUMAN_QUALITY_SOURCE_LABELS).optional(),
  expectedHardFailures: z.array(hardFailureSchema).optional(),
  expectedHumanVerdict: z.enum(["pass", "fail", "mixed", "pending"]).optional(),
  snapshot: z
    .object({
      available: z.boolean(),
      version: z.string().optional(),
      hash: z.string().optional(),
    })
    .optional(),
  observedHardFailures: z.array(hardFailureSchema),
  humanVerdict: z.enum(["pass", "fail", "mixed", "pending"]),
  humanNotes: z.string().optional(),
  /** External artifact pointer (R2 key, URL, or local path outside git). */
  artifactRef: z.string().optional(),
  capturedAt: z.string(),
});

export const productionPilotBaselineSchema = z.object({
  version: z.literal(PRODUCTION_PILOT_BASELINE_VERSION),
  pilotId: z.string().min(1),
  brandName: z.string().min(1),
  workspaceId: z.string().optional(),
  clientProfileId: z.string().optional(),
  /** Provenance of the capture session — not the image bytes. */
  provenance: z.object({
    source: z.enum(PRODUCTION_PILOT_PROVENANCE_SOURCES),
    evidenceSource: z.enum(HUMAN_QUALITY_SOURCE_LABELS).optional(),
    operator: z.string().optional(),
    notes: z.string().optional(),
  }),
  requests: z.array(productionPilotRequestBaselineSchema),
});

export type ProductionPilotBaseline = z.infer<typeof productionPilotBaselineSchema>;
export type ProductionPilotRequestBaseline = z.infer<
  typeof productionPilotRequestBaselineSchema
>;

/** Minimum coverage: 3 priority formats × ≥3 content patterns. */
export function baselineCoverageReport(baseline: ProductionPilotBaseline): {
  formats: string[];
  patterns: string[];
  meetsMinimum: boolean;
} {
  const formats = [...new Set(baseline.requests.map((r) => r.format))];
  const patterns = [...new Set(baseline.requests.map((r) => r.contentPattern))];
  const priorityFormats = ["1:1", "4:5", "9:16"] as const;
  const hasPriorityFormats = priorityFormats.every((f) =>
    (formats as string[]).includes(f),
  );
  return {
    formats,
    patterns,
    meetsMinimum: hasPriorityFormats && patterns.length >= 3,
  };
}
