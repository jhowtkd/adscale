/**
 * Phase 5 / item 38: free retry of a failed initial creative-work output.
 * Requeues the row and dispatches the same Inngest event. No billing.
 * Revisions must return through the paid revision command.
 */
import { inngest } from "@/server/jobs/client";
import {
  getCreativeWork,
  requeueFailedCreativeWorkOutput,
} from "@/server/repositories/creative-work";
import type { CreativeWorkOutput } from "@/server/db/schema";

export type RetryCreativeWorkOutputInput = {
  workspaceId: string;
  workItemId: string;
  outputId: string;
};

export type RetryCreativeWorkOutputError =
  | { code: "work_not_found" }
  | { code: "output_not_found" }
  | { code: "output_not_retriable"; status: string };

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
