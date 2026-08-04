/**
 * Controlled reference for production-pilot baselines (e.g. PreceptorIA).
 * Versioned metadata only — images stay out of git. Anchors on the phase-115
 * corpus infrastructure without a second parallel baseline system.
 */
import { z } from "zod";

export const PRODUCTION_PILOT_BASELINE_VERSION = 1 as const;

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
    source: z.enum(["production_pilot", "manual_capture", "replay"]),
    operator: z.string().optional(),
    notes: z.string().optional(),
  }),
  requests: z.array(productionPilotRequestBaselineSchema).min(1),
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
