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
import { recordUsage } from "@/server/billing/credits";
import { getUsageByIdempotencyKey } from "@/server/repositories/usage";
import {
  CREATIVE_WORK_MAX_IMAGE_CALLS,
  getCreativeWork,
  requeueFailedCreativeWorkOutput,
} from "@/server/repositories/creative-work";
import { GENERATION_CREDIT_COSTS } from "@/server/generation/canonical/types";
import type { CreativeWorkOutput } from "@/server/db/schema";

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

/**
 * Refund keys a failed output may carry. Each one can be compensated by at
 * most one reactivation debit — keyed per refund kind so a later refund of
 * the same kind can never be reactivated twice, and a new refund kind still
 * restores the net debit exactly once.
 */
const REFUND_KEY_KINDS = ["pregen", "terminal", "dispatch"] as const;
type RefundKeyKind = (typeof REFUND_KEY_KINDS)[number];

function refundIdempotencyKey(workItemId: string, outputId: string, kind: RefundKeyKind): string {
  return `creative-work:${workItemId}:output:${outputId}:${kind}-refund`;
}

function reactivationIdempotencyKey(workItemId: string, outputId: string, kind: RefundKeyKind): string {
  return `creative-work:${workItemId}:output:${outputId}:reactivate-${kind}`;
}

/**
 * Idempotent reactivation of the original per-output charge. For every
 * refund kind whose refund ledger row exists without a matching reactivation
 * row, re-debit the per-output amount under `...:reactivate-<kind>`.
 * recordUsage is idempotent by key, so repeating the manual command never
 * duplicates the debit; a blocked reactivation (insufficient credits) stops
 * the retry before any requeue/enqueue.
 */
export async function reactivateCreativeWorkOutputChargeIfRefunded(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  userId?: string;
}): Promise<{ reactivated: RefundKeyKind[] } | { blocked: true }> {
  const reactivated: RefundKeyKind[] = [];
  for (const kind of REFUND_KEY_KINDS) {
    const refundKey = refundIdempotencyKey(input.workItemId, input.outputId, kind);
    const refundRow = await getUsageByIdempotencyKey(input.workspaceId, refundKey);
    if (!refundRow) continue;
    const reactivationKey = reactivationIdempotencyKey(input.workItemId, input.outputId, kind);
    const existingReactivation = await getUsageByIdempotencyKey(input.workspaceId, reactivationKey);
    if (existingReactivation) continue;
    const result = await recordUsage({
      workspaceId: input.workspaceId,
      action: "image_derivation",
      idempotencyKey: reactivationKey,
      amount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
      metadata: {
        creativeWorkId: input.workItemId,
        outputId: input.outputId,
        description: "creative_work_retry_reactivation",
        reactivates: refundKey,
      },
      userId: input.userId,
    });
    if (result.status === "blocked") {
      return { blocked: true };
    }
    reactivated.push(kind);
  }
  return { reactivated };
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

  // Reactivate the refunded charge BEFORE the enqueue so a retried output
  // always holds exactly one net debit. Idempotent per refund key.
  const reactivation = await reactivateCreativeWorkOutputChargeIfRefunded({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    outputId: input.outputId,
    userId: input.userId,
  });
  if ("blocked" in reactivation) {
    return { ok: false, error: { code: "credit_blocked" } };
  }

  const reset = await requeueFailedCreativeWorkOutput(
    input.workspaceId,
    input.workItemId,
    input.outputId
  );
  if (!reset) {
    return {
      ok: false,
      error: { code: "output_not_retriable", status: "concurrent_change" },
    };
  }

  await inngest.send([
    {
      name: "creative-work.generate",
      data: {
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        outputId: input.outputId,
      },
    },
  ]);

  return { ok: true, value: { output: reset } };
}
