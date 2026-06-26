import { z } from "zod";
import { logger } from "@/lib/logger";
import { containsDeniedPersistenceKeys } from "@/server/repositories/assistant-types";
import { insertGuidedFlowTelemetryEvent } from "@/server/repositories/guided-flow-telemetry";

export const GUIDED_FLOW_EVENT_KEYS = [
  "guided_flow_started",
  "guided_step_viewed",
  "guided_input_supplied",
  "guided_action_blocked",
  "guided_action_proposed",
  "guided_action_confirmed",
  "guided_action_failed",
  "guided_flow_abandoned",
  "guided_flow_completed",
] as const;

export const GUIDED_FLOW_CORE_EVENT_KEYS = [
  "guided_flow_started",
  "guided_step_viewed",
  "guided_flow_completed",
] as const;

export const GUIDED_FLOW_ACTION_EVENT_KEYS = [
  "guided_action_proposed",
  "guided_action_confirmed",
  "guided_action_failed",
] as const;

export type GuidedFlowEventKey = (typeof GUIDED_FLOW_EVENT_KEYS)[number];

export const GUIDED_FLOW_BLOCKER_CATEGORIES = [
  "missing_asset",
  "missing_references",
  "missing_brief_fields",
  "action_failure",
  "validation_error",
  "provider_failure",
  "unknown",
] as const;

export type GuidedFlowBlockerCategory =
  (typeof GUIDED_FLOW_BLOCKER_CATEGORIES)[number];

export const ALLOWED_GUIDED_FLOW_METADATA_KEYS = [
  "inputType",
  "assetCount",
  "referenceCount",
  "missingFieldCount",
  "actionType",
  "status",
  "reasonCode",
  "isRetry",
  "hadCampaign",
] as const;

const scalarValueSchema = z.union([
  z.string().max(256),
  z.number(),
  z.boolean(),
  z.null(),
]);

const metadataSchema = z.strictObject(
  Object.fromEntries(
    ALLOWED_GUIDED_FLOW_METADATA_KEYS.map((key) => [
      key,
      scalarValueSchema.optional(),
    ])
  ) as Record<(typeof ALLOWED_GUIDED_FLOW_METADATA_KEYS)[number], z.ZodOptional<typeof scalarValueSchema>>
);

export type GuidedFlowMetadataValue = string | number | boolean | null;

export class GuidedFlowTelemetrySanitizationError extends Error {
  readonly details: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "GuidedFlowTelemetrySanitizationError";
    this.details = details;
  }
}

export function sanitizeGuidedFlowMetadata(
  input: unknown
): Record<string, GuidedFlowMetadataValue> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new GuidedFlowTelemetrySanitizationError(
      "metadata must be an object",
      { received: typeof input }
    );
  }

  if (containsDeniedPersistenceKeys(input)) {
    throw new GuidedFlowTelemetrySanitizationError(
      "metadata contains denied persistence keys"
    );
  }

  const parsed = metadataSchema.safeParse(input);
  if (!parsed.success) {
    throw new GuidedFlowTelemetrySanitizationError(
      "metadata failed validation",
      { issues: parsed.error.flatten() }
    );
  }

  const sanitized: Record<string, GuidedFlowMetadataValue> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

const telemetryLogger = logger.child("guided-flow-telemetry");

export interface RecordGuidedFlowTelemetryInput {
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  guidedFlowId?: string | null;
  path: string;
  step: string;
  eventKey: GuidedFlowEventKey;
  blockerCategory?: GuidedFlowBlockerCategory | null;
  actionRecordId?: string | null;
  campaignId?: string | null;
  metadata?: unknown;
  occurredAt?: Date;
}

export async function recordGuidedFlowTelemetryEvent(
  input: RecordGuidedFlowTelemetryInput
): Promise<void> {
  try {
    if (
      !GUIDED_FLOW_EVENT_KEYS.includes(
        input.eventKey as (typeof GUIDED_FLOW_EVENT_KEYS)[number]
      )
    ) {
      throw new GuidedFlowTelemetrySanitizationError("unknown event_key", {
        eventKey: input.eventKey,
      });
    }

    if (
      input.blockerCategory &&
      !GUIDED_FLOW_BLOCKER_CATEGORIES.includes(
        input.blockerCategory as GuidedFlowBlockerCategory
      )
    ) {
      throw new GuidedFlowTelemetrySanitizationError(
        "unknown blocker_category",
        { blockerCategory: input.blockerCategory }
      );
    }

    const metadata = sanitizeGuidedFlowMetadata(input.metadata ?? {});

    await insertGuidedFlowTelemetryEvent({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      threadId: input.threadId,
      guidedFlowId: input.guidedFlowId ?? null,
      path: input.path,
      step: input.step,
      eventKey: input.eventKey,
      blockerCategory: input.blockerCategory ?? null,
      actionRecordId: input.actionRecordId ?? null,
      campaignId: input.campaignId ?? null,
      metadata,
      occurredAt: input.occurredAt ?? new Date(),
    });
  } catch (error) {
    telemetryLogger.warn("guided_flow_telemetry.record_failed", {
      eventKey: input.eventKey,
      threadId: input.threadId,
      path: input.path,
      step: input.step,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function emitGuidedFlowTelemetry(
  input: RecordGuidedFlowTelemetryInput
): void {
  void recordGuidedFlowTelemetryEvent(input);
}
