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
  /**
   * Optional override for tests. Production callers omit this — expected stage
   * is always derived from originStatus via the naive origin→stage map.
   */
  expectedStage?: CanonicalWorkState | null;
  outputCount: number;
}

export interface ProjectionCompareResult {
  diverged: boolean;
  reason: string | null;
  expectedStage: CanonicalWorkState | null;
}

/**
 * Naive origin-status → funnel stage map (without enrichment from outputs,
 * selection, diagnosis, etc.). Used as the baseline for projection compare.
 */
export function expectedStageFromOriginStatus(
  originKind: "campaign" | "creative_work",
  originStatus: string
): CanonicalWorkState | null {
  if (originKind === "campaign") {
    switch (originStatus) {
      case "draft":
        return "intending";
      case "active":
        return "briefing";
      case "generating":
        return "generating";
      case "completed":
        return "reviewing";
      case "failed":
        return "failed";
      default:
        return null;
    }
  }

  switch (originStatus) {
    case "draft":
      return "intending";
    case "ready":
      return "briefing";
    case "generating":
      return "generating";
    case "partial":
      return "reviewing";
    case "completed":
      return "reviewing";
    case "failed":
      return "failed";
    default:
      return null;
  }
}

/**
 * Compares origin model status vs canonical projection for observability.
 * Does not change UI — structured log only (Phase 2 / item 18).
 *
 * `diverged` is true when the projected funnel stage differs from the naive
 * mapping of the raw origin status (enrichment / selection / diagnosis).
 */
export function compareProjectionTelemetry(
  input: ProjectionCompareInput
): ProjectionCompareResult {
  const expected =
    input.expectedStage !== undefined
      ? input.expectedStage
      : expectedStageFromOriginStatus(input.originKind, input.originStatus);

  const diverged =
    expected != null ? expected !== input.canonicalState : false;
  const reason = diverged
    ? `canonical_state=${input.canonicalState} expected_from_origin_status=${expected}`
    : expected == null
      ? `unknown_origin_status=${input.originStatus}`
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

  return { diverged, reason, expectedStage: expected };
}
