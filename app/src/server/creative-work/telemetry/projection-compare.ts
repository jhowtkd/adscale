import { logger } from "@/lib/logger";
import type { CreativeWorkOrigin } from "@/server/creative-work/funnel-events";
import type { CanonicalWorkState } from "@/server/creative-work/canonical/types";

export interface ProjectionCompareInput {
  workspaceId: string;
  origin: CreativeWorkOrigin;
  originKind: "campaign" | "creative_work";
  originId: string;
  /** Raw model status string (campaign.status or creative_work.status). */
  originStatus: string;
  canonicalState: CanonicalWorkState;
  /** Optional expected stage from a prior funnel event, if known. */
  expectedStage?: CanonicalWorkState | null;
  outputCount: number;
}

export interface ProjectionCompareResult {
  diverged: boolean;
  reason: string | null;
}

/**
 * Compares origin model status vs canonical projection for observability.
 * Does not change UI — structured log only (Phase 2 / item 18).
 */
export function compareProjectionTelemetry(
  input: ProjectionCompareInput
): ProjectionCompareResult {
  const expected = input.expectedStage ?? null;
  const diverged = expected != null && expected !== input.canonicalState;
  const reason = diverged
    ? `canonical_state=${input.canonicalState} expected=${expected}`
    : null;

  logger.info(
    JSON.stringify({
      type: "canonical_projection_compare",
      workspaceId: input.workspaceId,
      origin: input.origin,
      originKind: input.originKind,
      originId: input.originId,
      originStatus: input.originStatus,
      canonicalState: input.canonicalState,
      expectedStage: expected,
      outputCount: input.outputCount,
      diverged,
      reason,
    })
  );

  return { diverged, reason };
}
