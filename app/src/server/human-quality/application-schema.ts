import { z } from "zod";
import type { OutputLearningApplicationSnapshot } from "./corpus";
import {
  stripForbiddenPayloadKeys,
  validatePrivacySafePayload,
} from "./corpus";

export const OUTPUT_LEARNING_APPLICATION_SCHEMA_VERSION = 1 as const;

export const LEGACY_OUTPUT_LEARNING_APPLICATION_SNAPSHOT: OutputLearningApplicationSnapshot =
  {
    schemaVersion: OUTPUT_LEARNING_APPLICATION_SCHEMA_VERSION,
    applied: false,
    resolution: "not_recorded",
    learningsSource: "postgres",
  };

const TRACE_ID_PATTERN = /^ol-/;

export const outputLearningApplicationSchema = z
  .object({
    schemaVersion: z.literal(OUTPUT_LEARNING_APPLICATION_SCHEMA_VERSION),
    applied: z.boolean(),
    resolution: z.enum(["recorded", "not_recorded", "recommendation_only"]),
    traceId: z.string().regex(TRACE_ID_PATTERN).max(120).optional(),
    recommendationId: z.string().max(120).optional(),
    primaryVariableKey: z.string().max(120).optional(),
    algorithmVersion: z.string().max(40).optional(),
    safetyVersion: z.string().max(40).optional(),
    learningsSource: z.literal("postgres"),
  })
  .strict();

export function sanitizeOutputLearningApplication(
  input: Record<string, unknown>
): OutputLearningApplicationSnapshot {
  const privacyCheck = validatePrivacySafePayload(input);
  if (!privacyCheck.ok) {
    const stripped = stripForbiddenPayloadKeys(input);
    const retry = validatePrivacySafePayload(stripped);
    if (!retry.ok) {
      throw new Error(retry.error);
    }
    return parseOutputLearningApplication(stripped);
  }
  return parseOutputLearningApplication(input);
}

export function parseOutputLearningApplication(
  input: unknown
): OutputLearningApplicationSnapshot {
  const parsed = outputLearningApplicationSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }
  return parsed.data;
}

export function buildApplicationSnapshotFromAccept(input: {
  traceId: string;
  recommendationId: string;
  primaryVariableKey: string;
  algorithmVersion: string;
  safetyVersion: string;
}): OutputLearningApplicationSnapshot {
  return sanitizeOutputLearningApplication({
    schemaVersion: OUTPUT_LEARNING_APPLICATION_SCHEMA_VERSION,
    applied: true,
    resolution: "recorded",
    traceId: input.traceId,
    recommendationId: input.recommendationId,
    primaryVariableKey: input.primaryVariableKey,
    algorithmVersion: input.algorithmVersion,
    safetyVersion: input.safetyVersion,
    learningsSource: "postgres",
  });
}

export function resolveOutputLearningApplication(
  stored: OutputLearningApplicationSnapshot | null | undefined
): OutputLearningApplicationSnapshot {
  if (!stored) {
    return { ...LEGACY_OUTPUT_LEARNING_APPLICATION_SNAPSHOT };
  }
  return stored;
}
