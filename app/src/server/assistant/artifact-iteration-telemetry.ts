import { z } from "zod";
import { logger } from "@/lib/logger";
import { containsDeniedPersistenceKeys } from "@/server/repositories/assistant-types";
import { insertArtifactIterationTelemetryEvent } from "@/server/repositories/artifact-iteration-telemetry";

export const ARTIFACT_ITERATION_EVENT_KEYS = [
  "proposal_created",
  "proposal_confirmed",
  "generation_enqueued",
  "generation_succeeded",
  "generation_failed",
  "comparison_opened",
  "comparison_acknowledged",
  "promotion_requested",
  "promotion_succeeded",
  "promotion_conflict",
  "retry_requested",
  "proposal_staled",
] as const;

export const ARTIFACT_ITERATION_CORE_EVENT_KEYS = [
  "proposal_created",
  "proposal_confirmed",
  "generation_succeeded",
] as const;

export const ARTIFACT_ITERATION_GENERATION_EVENT_KEYS = [
  "generation_enqueued",
  "generation_succeeded",
  "generation_failed",
] as const;

export const ARTIFACT_ITERATION_PROMOTION_EVENT_KEYS = [
  "promotion_requested",
  "promotion_succeeded",
  "promotion_conflict",
] as const;

export type ArtifactIterationEventKey = (typeof ARTIFACT_ITERATION_EVENT_KEYS)[number];

export const ARTIFACT_ITERATION_PATHS = [
  "plan_iteration",
  "creative_iteration",
  "compare_approve",
] as const;

export type ArtifactIterationPath = (typeof ARTIFACT_ITERATION_PATHS)[number];

export const ARTIFACT_ITERATION_REASON_CODES = [
  "head_conflict",
  "proposal_stale",
  "plan_changed",
  "concurrent_head_change",
  "generation_failure",
  "enqueue_failed",
  "derivation_failed",
  "unknown",
] as const;

export type ArtifactIterationReasonCode =
  (typeof ARTIFACT_ITERATION_REASON_CODES)[number];

export const ALLOWED_ARTIFACT_ITERATION_METADATA_KEYS = [
  "artifactType",
  "lineageId",
  "versionNumber",
  "sourceVersionNumber",
  "targetVersionNumber",
  "proposalId",
  "actionId",
  "operationId",
  "reasonCode",
  "headRevision",
  "idempotent",
  "replayed",
  "status",
  "isRetry",
] as const;

const scalarValueSchema = z.union([
  z.string().max(256),
  z.number(),
  z.boolean(),
  z.null(),
]);

const metadataSchema = z.strictObject(
  Object.fromEntries(
    ALLOWED_ARTIFACT_ITERATION_METADATA_KEYS.map((key) => [
      key,
      scalarValueSchema.optional(),
    ])
  ) as Record<
    (typeof ALLOWED_ARTIFACT_ITERATION_METADATA_KEYS)[number],
    z.ZodOptional<typeof scalarValueSchema>
  >
);

export type ArtifactIterationMetadataValue = string | number | boolean | null;

export class ArtifactIterationTelemetrySanitizationError extends Error {
  readonly details: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "ArtifactIterationTelemetrySanitizationError";
    this.details = details;
  }
}

export function sanitizeArtifactIterationMetadata(
  input: unknown
): Record<string, ArtifactIterationMetadataValue> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ArtifactIterationTelemetrySanitizationError(
      "metadata must be an object",
      { received: typeof input }
    );
  }

  if (containsDeniedPersistenceKeys(input)) {
    throw new ArtifactIterationTelemetrySanitizationError(
      "metadata contains denied persistence keys"
    );
  }

  const parsed = metadataSchema.safeParse(input);
  if (!parsed.success) {
    throw new ArtifactIterationTelemetrySanitizationError(
      "metadata failed validation",
      { issues: parsed.error.flatten() }
    );
  }

  const sanitized: Record<string, ArtifactIterationMetadataValue> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

const telemetryLogger = logger.child("artifact-iteration-telemetry");

export interface RecordArtifactIterationTelemetryInput {
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  campaignId?: string | null;
  actionRecordId?: string | null;
  path: ArtifactIterationPath;
  step: string;
  eventKey: ArtifactIterationEventKey;
  reasonCode?: ArtifactIterationReasonCode | null;
  metadata?: unknown;
  occurredAt?: Date;
}

export interface EmitArtifactIterationFromScopeInput {
  scope: {
    workspaceId: string;
    clientProfileId: string;
    campaignId: string;
    threadId: string;
  };
  eventKey: ArtifactIterationEventKey;
  actionRecordId?: string | null;
  reasonCode?: ArtifactIterationReasonCode | null;
  metadata?: unknown;
  occurredAt?: Date;
}

function inferPathAndStep(
  eventKey: ArtifactIterationEventKey,
  metadata: Record<string, ArtifactIterationMetadataValue>
): { path: ArtifactIterationPath; step: string } {
  const artifactType = metadata.artifactType;
  switch (eventKey) {
    case "proposal_created":
      return {
        path: artifactType === "creative" ? "creative_iteration" : "plan_iteration",
        step: "propose",
      };
    case "proposal_confirmed":
      return {
        path: artifactType === "creative" ? "creative_iteration" : "plan_iteration",
        step: "confirm",
      };
    case "proposal_staled":
      return {
        path: artifactType === "creative" ? "creative_iteration" : "plan_iteration",
        step: "propose",
      };
    case "generation_enqueued":
    case "generation_succeeded":
    case "generation_failed":
    case "retry_requested":
      return { path: "creative_iteration", step: "generate" };
    case "comparison_opened":
      return { path: "compare_approve", step: "compare" };
    case "comparison_acknowledged":
      return { path: "compare_approve", step: "acknowledge" };
    case "promotion_requested":
    case "promotion_succeeded":
    case "promotion_conflict":
      return { path: "compare_approve", step: "promote" };
  }
}

function normalizeEmitInput(
  input: RecordArtifactIterationTelemetryInput | EmitArtifactIterationFromScopeInput
): RecordArtifactIterationTelemetryInput {
  if (!("scope" in input)) {
    return input;
  }

  const metadata = sanitizeArtifactIterationMetadata(input.metadata ?? {});
  const metadataReason =
    typeof metadata.reasonCode === "string"
      ? (metadata.reasonCode as ArtifactIterationReasonCode)
      : null;
  if (metadataReason) {
    delete metadata.reasonCode;
  }

  const { path, step } = inferPathAndStep(input.eventKey, metadata);

  return {
    workspaceId: input.scope.workspaceId,
    clientProfileId: input.scope.clientProfileId,
    threadId: input.scope.threadId,
    campaignId: input.scope.campaignId,
    actionRecordId: input.actionRecordId ?? null,
    path,
    step,
    eventKey: input.eventKey,
    reasonCode: input.reasonCode ?? metadataReason,
    metadata,
    occurredAt: input.occurredAt,
  };
}

export async function recordArtifactIterationTelemetryEvent(
  input: RecordArtifactIterationTelemetryInput
): Promise<void> {
  try {
    if (
      !ARTIFACT_ITERATION_EVENT_KEYS.includes(
        input.eventKey as (typeof ARTIFACT_ITERATION_EVENT_KEYS)[number]
      )
    ) {
      throw new ArtifactIterationTelemetrySanitizationError("unknown event_key", {
        eventKey: input.eventKey,
      });
    }

    if (
      !ARTIFACT_ITERATION_PATHS.includes(
        input.path as (typeof ARTIFACT_ITERATION_PATHS)[number]
      )
    ) {
      throw new ArtifactIterationTelemetrySanitizationError("unknown path", {
        path: input.path,
      });
    }

    if (
      input.reasonCode &&
      !ARTIFACT_ITERATION_REASON_CODES.includes(
        input.reasonCode as ArtifactIterationReasonCode
      )
    ) {
      throw new ArtifactIterationTelemetrySanitizationError(
        "unknown reason_code",
        { reasonCode: input.reasonCode }
      );
    }

    const metadata = sanitizeArtifactIterationMetadata(input.metadata ?? {});

    await insertArtifactIterationTelemetryEvent({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      threadId: input.threadId,
      campaignId: input.campaignId ?? null,
      actionRecordId: input.actionRecordId ?? null,
      path: input.path,
      step: input.step,
      eventKey: input.eventKey,
      reasonCode: input.reasonCode ?? null,
      metadata,
      occurredAt: input.occurredAt ?? new Date(),
    });
  } catch (error) {
    telemetryLogger.warn("artifact_iteration_telemetry.record_failed", {
      eventKey: input.eventKey,
      threadId: input.threadId,
      path: input.path,
      step: input.step,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function emitArtifactIterationTelemetry(
  input: RecordArtifactIterationTelemetryInput | EmitArtifactIterationFromScopeInput
): void {
  try {
    void recordArtifactIterationTelemetryEvent(normalizeEmitInput(input));
  } catch (error) {
    telemetryLogger.warn("artifact_iteration_telemetry.emit_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
