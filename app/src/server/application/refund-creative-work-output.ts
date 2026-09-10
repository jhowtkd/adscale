import { logger } from "@/lib/logger";
import { decideCreativeWorkRefund } from "@/server/generation/canonical/policies";
import { settleTerminalRefund } from "@/server/generation/settlement";
import { resolveCreativeWorkOutputReactivationOutcome } from "@/server/generation/settlement-adapters";

export type CompensatoryRefundFailurePhase = "job_failure" | "terminal";

/**
 * Shared compensatory refund for creative-work outputs (R1).
 *
 * Extracted verbatim from the creative-work detail GET so the job, onFailure
 * and GET recover the same pending compensation through one canonical path.
 * The boolean confirms the operation is liquidated — it does not imply a
 * financial debit happened under unlimited-billing bypass.
 */
export async function refundCreativeWorkOutputCompensatory(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  reason: string;
  manualRetryAttempt?: number | null;
  failurePhase?: CompensatoryRefundFailurePhase;
  /** Authenticated actor for the ledger movement, when available. */
  userId?: string;
}): Promise<boolean> {
  const outcome = await resolveCreativeWorkOutputReactivationOutcome({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    outputId: input.outputId,
    manualRetryAttempt: input.manualRetryAttempt,
  });
  if (outcome.state === "already_refunded") return true;
  const reactivation = outcome.state === "outstanding" ? outcome : null;
  const canonicalFailurePhase: "job_failure" | "terminal" = reactivation || input.failurePhase === "terminal"
    ? "terminal"
    : "job_failure";
  const canonicalDecision = decideCreativeWorkRefund({
    surface: "quick_tool",
    failurePhase: canonicalFailurePhase,
    workItemId: input.workItemId,
    outputId: input.outputId,
  });
  const decision = reactivation && canonicalDecision.refund
    ? {
        ...canonicalDecision,
        idempotencyKey: reactivation.refundKey,
        reason: "creative_work_terminal_reactivation_failure",
      }
    : canonicalDecision;
  if (!decision.refund) return true;
  const settled = await settleTerminalRefund({
    decision,
    workspaceId: input.workspaceId,
    action: "image_derivation",
    metadata: {
      creativeWorkId: input.workItemId,
      outputId: input.outputId,
      reason: input.reason,
      description: "creative_work_compensatory_refund",
    },
    userId: input.userId,
  });
  if (!settled.applied) {
    logger.warn({
      event: "image_pipeline_stage",
      stage: "compensatory_refund",
      status: "failed",
      outputId: input.outputId,
      errorMessage: settled.error,
    });
    return false;
  }
  return true;
}
