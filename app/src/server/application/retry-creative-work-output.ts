/**
 * Phase 5 / item 38 + R-006: free retry of a failed initial creative-work
 * output on the SAME row.
 *
 * Eligibility is governed by the durable budget: `imageCallCount` is the
 * sole provider-call authority, so a retry is only offered while
 * `imageCallCount < CREATIVE_WORK_MAX_IMAGE_CALLS` — never a third provider
 * call from a manual click. When the output's charge was already refunded,
 * the original operation is reactivated idempotently BEFORE the enqueue
 * (one reactivation per refund key), keeping at most one net debit, never
 * two. Revisions must return through the paid revision command.
 */
import { inngest } from "@/server/jobs/client";
import { heavyImageEventName } from "@/server/jobs/heavy-image-events";
import {
  CREATIVE_WORK_MAX_IMAGE_CALLS,
  claimCreativeWorkOutputManualRetryAttempt,
  releaseCreativeWorkOutputManualRetryAttempt,
  failQueuedCreativeWorkOutput,
  getCreativeWork,
  markCreativeWorkOutputFailureCode,
  requeueFailedCreativeWorkOutput,
} from "@/server/repositories/creative-work";
import {
  reactivateCreativeWorkOutputRefund,
  resolveCreativeWorkOutputReactivation,
  resolveCreativeWorkOutputReactivationOutcome,
} from "@/server/generation/settlement-adapters";
import {
  creativeWorkTerminalReactivationIdempotencyKey,
  creativeWorkTerminalReactivationRefundIdempotencyKey,
} from "@/server/generation/canonical/policies";
import { GENERATION_CREDIT_COSTS } from "@/server/generation/canonical/types";
import { settleTerminalRefund } from "@/server/generation/settlement";
import { getUsageByIdempotencyKey } from "@/server/repositories/usage";
import { decideCreativeWorkRefund } from "@/server/generation/canonical/policies";
import type { CreativeWorkOutput } from "@/server/db/schema";
import { logCreativeWorkRetry } from "@/server/creative-work/job-telemetry";

export type RetryCreativeWorkOutputInput = {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  /** Optional: threaded into the reactivation ledger row for analytics. */
  userId?: string;
};

export type RetryCreativeWorkOutputError =
  | { code: "work_not_found" }
  | { code: "output_not_found" }
  | { code: "output_not_retriable"; status: string }
  | { code: "credit_blocked" };

export type RetryCreativeWorkOutputSuccess = {
  output: CreativeWorkOutput;
};

export type RetryCreativeWorkOutputResult =
  | { ok: true; value: RetryCreativeWorkOutputSuccess }
  | { ok: false; error: RetryCreativeWorkOutputError };

async function compensateManualRetryFailure(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  manualRetryAttempt: number;
  userId?: string;
  reason: string;
  hasManualDebit: boolean;
  outstandingRefundKey?: string;
}): Promise<boolean> {
  const canonical = decideCreativeWorkRefund({
    surface: "quick_tool",
    failurePhase: "terminal",
    workItemId: input.workItemId,
    outputId: input.outputId,
  });
  const settlement = await settleTerminalRefund({
    workspaceId: input.workspaceId,
    userId: input.userId,
    decision: input.hasManualDebit && canonical.refund
      ? {
          ...canonical,
          idempotencyKey: input.outstandingRefundKey ?? creativeWorkTerminalReactivationRefundIdempotencyKey(input.workItemId, input.outputId, input.manualRetryAttempt),
          reason: "creative_work_terminal_reactivation_failure",
        }
      : canonical,
    metadata: {
      creativeWorkId: input.workItemId,
      outputId: input.outputId,
      reason: input.reason,
      description: "creative_work_manual_retry_failure_refund",
    },
  });
  return settlement.applied;
}

export async function retryCreativeWorkOutput(
  input: RetryCreativeWorkOutputInput
): Promise<RetryCreativeWorkOutputResult> {
  const existing = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!existing) {
    return { ok: false, error: { code: "work_not_found" } };
  }

  const output = existing.outputs.find((o) => o.id === input.outputId);
  if (!output) {
    return { ok: false, error: { code: "output_not_found" } };
  }

  if (output.status !== "failed") {
    return {
      ok: false,
      error: { code: "output_not_retriable", status: output.status },
    };
  }

  if (output.parentOutputId) {
    return {
      ok: false,
      error: { code: "output_not_retriable", status: "revision_requires_paid_command" },
    };
  }

  // R-006: the durable budget is the retry eligibility authority. An output
  // whose two provider calls are already consumed can never get a third one
  // from a manual click.
  if (output.imageCallCount >= CREATIVE_WORK_MAX_IMAGE_CALLS) {
    return {
      ok: false,
      error: { code: "output_not_retriable", status: "image_call_budget_exhausted" },
    };
  }

  // `retryCount` measures technical delivery/provider work.  It is not a
  // financial ordinal: automatic retries must never move a manual debit to a
  // different ledger key. Reserve the manual ordinal with a row CAS before
  // charging it, so duplicate clicks converge on one operation.
  const currentManualAttempt = output.manualRetryAttempt ?? null;
  let manualAttempt = currentManualAttempt ?? 1;
  let outstanding = await resolveCreativeWorkOutputReactivation({
    workspaceId: input.workspaceId, workItemId: input.workItemId, outputId: input.outputId,
    manualRetryAttempt: currentManualAttempt,
  });
  // Existing historical/ambiguous debits are joined by the status CAS below;
  // never allocate or charge a second modern attempt for them.
  let joinsOutstandingDebit = Boolean(outstanding);
  // Keep the resolved debit as the financial authority through every later
  // failure branch. In particular, a legacy reactivation has no modern
  // ordinal on the output, but is still an outstanding debit to compensate.
  let hasManualDebit = joinsOutstandingDebit;
  let recoversUnchargedReservation = false;
  if (currentManualAttempt) {
    const [currentCharge, currentRefund] = await Promise.all([
      getUsageByIdempotencyKey(
        input.workspaceId,
        creativeWorkTerminalReactivationIdempotencyKey(input.workItemId, input.outputId, currentManualAttempt),
      ),
      getUsageByIdempotencyKey(
        input.workspaceId,
        creativeWorkTerminalReactivationRefundIdempotencyKey(input.workItemId, input.outputId, currentManualAttempt),
      ),
    ]);
    // A transport error can happen after recordUsage commits.  The durable
    // ledger row is the authority: reuse that exact attempt and finish its
    // guarded enqueue instead of permanently stranding the debit.
    if (currentCharge && !currentRefund) hasManualDebit = true;
    if (currentRefund) manualAttempt = currentManualAttempt + 1;
    // The reservation is durable before recordUsage. A transport failure
    // before its commit leaves this same ordinal failed with no ledger rows;
    // reuse its idempotency key rather than attempting an impossible no-op CAS.
    recoversUnchargedReservation = !currentCharge && !currentRefund;
  }

  if (!joinsOutstandingDebit && !recoversUnchargedReservation) {
    const claimed = await claimCreativeWorkOutputManualRetryAttempt(
      input.workspaceId, input.workItemId, input.outputId, output.retryCount, currentManualAttempt, manualAttempt,
    );
    if (!claimed) return { ok: false, error: { code: "output_not_retriable", status: "concurrent_change" } };
  }

  // Reactivate the one real refund that made this output net-zero before the
  // enqueue. The adapter resolves compensatory, terminal, dispatch and legacy
  // pregen records deterministically, then records at most one debit.
  let reactivation = joinsOutstandingDebit ? { reactivated: [] as ("terminal")[] } : await reactivateCreativeWorkOutputRefund({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    outputId: input.outputId,
    retryAttempt: manualAttempt,
    amount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
    userId: input.userId,
  });
  if ("blocked" in reactivation) {
    // A concurrent same-key recordUsage may have committed while this caller
    // observed `blocked`. Re-read under READ COMMITTED before releasing the
    // durable ordinal: the ledger, not the local response, is authoritative.
    const reread = await resolveCreativeWorkOutputReactivationOutcome({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      outputId: input.outputId,
      manualRetryAttempt: currentManualAttempt ?? manualAttempt,
    });
    if (reread.state === "outstanding") {
      outstanding = reread;
      joinsOutstandingDebit = true;
      hasManualDebit = true;
      reactivation = { reactivated: [] as ("terminal")[] };
    } else {
      // An already-paired refund is a settled attempt. Preserve its ordinal so
      // the next command can allocate the next attempt; only a proven-empty
      // ledger can safely release an uncharged reservation.
      if (reread.state === "none" && !joinsOutstandingDebit) await releaseCreativeWorkOutputManualRetryAttempt(
        input.workspaceId, input.workItemId, input.outputId, output.retryCount, manualAttempt,
      );
      return { ok: false, error: { code: "credit_blocked" } };
    }
  }
  hasManualDebit ||= reactivation.reactivated.length > 0;

  const reset = await requeueFailedCreativeWorkOutput(
    input.workspaceId,
    input.workItemId,
    input.outputId,
    output.retryCount,
    joinsOutstandingDebit ? currentManualAttempt ?? undefined : manualAttempt,
  );
  if (!reset) {
    const raced = await getCreativeWork(input.workspaceId, input.workItemId);
    const racedOutput = raced?.outputs.find((candidate) => candidate.id === input.outputId);
    if (racedOutput?.status === "queued" && racedOutput.manualRetryAttempt === manualAttempt) {
      return { ok: true, value: { output: racedOutput } };
    }
    // A winner can have progressed from queued to processing before this
    // loser rereads. That is durable proof the debit belongs to an active
    // generation and must never be compensated here.
    if (racedOutput && racedOutput.status !== "failed") {
      return { ok: false, error: { code: "output_not_retriable", status: "concurrent_change" } };
    }
    // A debit that won before the guarded requeue must not be stranded when a
    // cancellation/other terminal transition wins the CAS.
    await compensateManualRetryFailure({
      ...input,
      manualRetryAttempt: manualAttempt,
      hasManualDebit,
      outstandingRefundKey: outstanding?.refundKey,
      reason: "manual_retry_requeue_lost",
    });
    return {
      ok: false,
      error: { code: "output_not_retriable", status: "concurrent_change" },
    };
  }

  logCreativeWorkRetry({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    outputId: input.outputId,
    generationCorrelationId: existing.work.generationCorrelationId,
    action: "manual_retry",
    reason: "user_requested_retry",
    retryCount: reset.retryCount,
    imageCallCount: reset.imageCallCount,
  });
  try {
    await inngest.send([
      {
        id: `creative-work-generate:${input.outputId}:retry-${reset.retryCount}`,
        name: heavyImageEventName("creative-work.generate"),
        data: {
          workspaceId: input.workspaceId,
          workItemId: input.workItemId,
          outputId: input.outputId,
          generationCorrelationId: existing.work.generationCorrelationId,
        },
      },
    ]);
  } catch {
    const terminalized = await failQueuedCreativeWorkOutput(
      input.workspaceId,
      input.workItemId,
      input.outputId,
      "manual_retry_dispatch_failed",
    );
    // A lost CAS means the event may have been accepted and is now active;
    // preserving its debit prevents a free provider generation.
    const refunded = terminalized && await compensateManualRetryFailure({
      ...input,
      manualRetryAttempt: manualAttempt,
      hasManualDebit,
      outstandingRefundKey: outstanding?.refundKey,
      reason: "manual_retry_dispatch_failed",
    });
    if (terminalized && !refunded) {
      await markCreativeWorkOutputFailureCode(
        input.workspaceId,
        input.workItemId,
        input.outputId,
        "manual_retry_dispatch_failed_refund_pending",
      );
    }
    return { ok: false, error: { code: "output_not_retriable", status: "dispatch_failed" } };
  }

  return { ok: true, value: { output: reset } };
}
