import { z } from "zod";

export const LAYERIZATION_STATUSES = [
  "queued",
  "processing",
  "reconciling",
  "finalizing",
  "submission_unknown",
  "completed",
  "failed",
] as const;

export type LayerizationStatus = (typeof LAYERIZATION_STATUSES)[number];

export const LAYERIZATION_FAILURE_CODES = [
  "dispatch_failed",
  "missing_configuration",
  "source_missing",
  "provider_error",
  "invalid_provider_response",
  "unsafe_media",
  "fidelity_gate_failed",
  "storage_error",
  "submission_unknown",
] as const;

export type LayerizationFailureCode = (typeof LAYERIZATION_FAILURE_CODES)[number];

const isoDate = z.string().datetime({ offset: true });

export const layerizationLayerSchema = z.object({
  order: z.number().int().min(0).max(16),
  isBase: z.boolean(),
  name: z.string().trim().min(1).max(128),
  description: z.string().trim().min(1).max(1000),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  normalizedBoundingBox: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  }).strict(),
  storageKey: z.string().min(1),
  sourceBytes: z.number().int().positive(),
}).strict();

export type LayerizationLayer = z.infer<typeof layerizationLayerSchema>;

export const fidelityResultSchema = z.object({
  normalizedMae: z.number().min(0),
  rmse: z.number().min(0),
  psnrDb: z.number().min(0),
  gate: z.enum(["passed", "failed"]),
}).strict();

export type FidelityResult = z.infer<typeof fidelityResultSchema>;

export const layerizationStateSchema = z.object({
  status: z.enum(LAYERIZATION_STATUSES),
  attemptId: z.string().min(1).max(128),
  callbackTokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  callbackConsumedAt: isoDate.nullable(),
  requestedByUserId: z.string().min(1),
  createdAt: isoDate,
  updatedAt: isoDate,
  callbackDeadlineAt: isoDate,
  providerRequestId: z.string().min(1).max(256).nullable(),
  providerModel: z.string().min(1).max(256),
  providerEndpoint: z.string().url(),
  estimatedCostUsd: z.number().nonnegative().nullable(),
  baseWidth: z.number().int().positive().nullable(),
  baseHeight: z.number().int().positive().nullable(),
  layers: z.array(layerizationLayerSchema).max(17),
  psdKey: z.string().min(1).nullable(),
  diagnosticZipKey: z.string().min(1).nullable(),
  fidelity: fidelityResultSchema.nullable(),
  failureCode: z.enum(LAYERIZATION_FAILURE_CODES).nullable(),
}).strict();

export type LayerizationState = z.infer<typeof layerizationStateSchema>;

export type PublicLayerizationState = Omit<LayerizationState, "callbackTokenHash">;

export function toPublicLayerizationState(value: unknown): PublicLayerizationState | null {
  const state = layerizationStateFromDatabase(value);
  if (!state) return null;
  const { callbackTokenHash: _callbackTokenHash, ...publicState } = state;
  void _callbackTokenHash;
  return publicState;
}

export function isLayerizationRetryableFailure(
  state: Pick<LayerizationState, "status" | "failureCode"> | null | undefined,
): boolean {
  return state?.status === "failed" && (
    state.failureCode === "dispatch_failed" ||
    state.failureCode === "missing_configuration" ||
    state.failureCode === "source_missing"
  );
}

export function layerizationStateFromDatabase(value: unknown): LayerizationState | null {
  if (!value) return null;
  const parsed = layerizationStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
