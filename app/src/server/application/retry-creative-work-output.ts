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
  getCreativeWork,
  requeueFailedCreativeWorkOutput,
} from "@/server/repositories/creative-work";
import { reactivateCreativeWorkOutputRefund } from "@/server/generation/settlement-adapters";
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
  // always holds exactly one net debit. Idempotent per refund kind. The
  // application layer owns the product price; settlement only executes it.
  const reactivation = await reactivateCreativeWorkOutputRefund({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    outputId: input.outputId,
    amount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
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
      name: heavyImageEventName("creative-work.generate"),
      data: {
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        outputId: input.outputId,
      },
    },
  ]);

  return { ok: true, value: { output: reset } };
}