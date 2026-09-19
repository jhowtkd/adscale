import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";
import { sanitizeBetaEventProperties } from "@/server/beta-analytics/sanitize";
import { findBetaAnalyticsEventByPiece, insertBetaAnalyticsEventIdempotent } from "@/server/repositories/beta-analytics";
import { validateCampaignOwnership } from "@/server/feedback/validate-refs";
import type { BetaAnalyticsEvent } from "@/server/db/schema";
import {
  canonicalCreativeWorkOrigin,
  originFromCreativeWork,
} from "./funnel-events";

export type CreativeWorkValueEventKind = "approved" | "delivered";

export type CreativeWorkValueEventInput = {
  kind: CreativeWorkValueEventKind;
  userId: string;
  workspaceId: string;
  creativeWorkId: string;
  outputId: string;
  outputKey: string;
  protocol: string;
  origin?: string | null;
  campaignId?: string | null;
  clientProfileId?: string | null;
  /**
   * Approval time (strict path only): the event cohorts on it. Absent =
   * database default (processing time). The tolerant legacy helper ignores it.
   */
  occurredAt?: Date;
};

function valueEventKey(kind: CreativeWorkValueEventKind): string {
  return kind === "approved" ? "creative_work_approved" : "creative_work_delivered";
}

function valueEventProperties(input: CreativeWorkValueEventInput): Record<string, unknown> {
  return {
    creativeWorkId: input.creativeWorkId,
    outputId: input.outputId,
    outputKey: input.outputKey,
    protocol: input.protocol,
    origin: canonicalCreativeWorkOrigin(input.origin),
    ...(input.clientProfileId ? { clientProfileId: input.clientProfileId } : {}),
  };
}

export async function recordCreativeWorkValueEvent(
  input: CreativeWorkValueEventInput
): Promise<void> {
  const eventKey = valueEventKey(input.kind);
  try {
    const existing = await findBetaAnalyticsEventByPiece({
      workspaceId: input.workspaceId,
      eventKey,
      outputId: input.outputId,
      outputKey: input.outputKey,
    });
    if (existing) return;
    await recordBetaAnalyticsEvent({
      workspaceId: input.workspaceId,
      userId: input.userId,
      eventKey,
      source: "server",
      campaignId: input.campaignId ?? null,
      properties: valueEventProperties(input),
    });
  } catch (error) {
    console.error("recordCreativeWorkValueEvent failed", error);
  }
}

/**
 * Deterministic identity of one logical value event: workspace, event type
 * and piece. Concurrent writers and next-day retries converge on it.
 */
export function valueEventIdempotencyKey(input: {
  workspaceId: string;
  eventKey: string;
  outputId: string;
}): string {
  return `ve1:${input.workspaceId}:${input.eventKey}:${input.outputId}`;
}

/**
 * Strict value-event path (ICE-03A): constraint-level deduplicated write
 * that THROWS when the write fails and returns the confirmed record —
 * never a swallowed error. Used by the selection outbox; legacy callers
 * outside the outbox keep the tolerant helper above.
 */
export async function recordCreativeWorkValueEventStrict(
  input: CreativeWorkValueEventInput
): Promise<BetaAnalyticsEvent> {
  const eventKey = valueEventKey(input.kind);
  const properties = sanitizeBetaEventProperties(valueEventProperties(input));
  if (input.campaignId) {
    await validateCampaignOwnership(input.workspaceId, input.campaignId);
  }
  const { event } = await insertBetaAnalyticsEventIdempotent({
    workspaceId: input.workspaceId,
    userId: input.userId,
    eventKey,
    properties,
    sessionId: null,
    campaignId: input.campaignId ?? null,
    derivationId: null,
    source: "server",
    ...(input.occurredAt ? { createdAt: input.occurredAt } : {}),
    idempotencyKey: valueEventIdempotencyKey({
      workspaceId: input.workspaceId,
      eventKey,
      outputId: input.outputId,
    }),
  });
  return event;
}

export function valueEventFromCreativeWork(work: {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  clientProfileId: string;
  campaignId?: string | null;
  toolKind: string;
}): {
  userId: string;
  workspaceId: string;
  creativeWorkId: string;
  protocol: string;
  origin: ReturnType<typeof originFromCreativeWork>;
  campaignId: string | null;
  clientProfileId: string;
} {
  return {
    userId: work.createdByUserId,
    workspaceId: work.workspaceId,
    creativeWorkId: work.id,
    protocol: work.toolKind,
    origin: originFromCreativeWork(work),
    campaignId: work.campaignId ?? null,
    clientProfileId: work.clientProfileId,
  };
}
