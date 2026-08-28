import type { CreativeWorkOutput } from "@/server/db/schema";
import {
  cancelCreativeWorkOutput as cancelOutput,
  getCreativeWork,
  markCreativeWorkOutputFailureCode,
  recordCreativeWorkGenerationAggregate,
  refreshCreativeWorkStatus,
} from "@/server/repositories/creative-work";
import { decideCreativeWorkRefund } from "@/server/generation/canonical/policies";
import { settleTerminalRefund } from "@/server/generation/settlement";
import { resolveCreativeWorkOutputReactivation } from "@/server/generation/settlement-adapters";
import {
  logCreativeWorkGenerationAggregate,
  logCreativeWorkOutputTerminal,
} from "@/server/creative-work/job-telemetry";

type CancelCreativeWorkOutputResult =
  | { ok: true; value: { output: CreativeWorkOutput; refunded: boolean } }
  | { ok: false; error: { code: "work_not_found" | "output_not_found" | "output_not_cancellable"; status?: string } };

export async function cancelCreativeWorkOutput(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  userId?: string;
}): Promise<CancelCreativeWorkOutputResult> {
  const existing = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!existing) return { ok: false, error: { code: "work_not_found" } };

  const current = existing.outputs.find((output) => output.id === input.outputId);
  if (!current) return { ok: false, error: { code: "output_not_found" } };
  if (current.status !== "queued" && current.status !== "processing") {
    return {
      ok: false,
      error: { code: "output_not_cancellable", status: current.status },
    };
  }

  const output = await cancelOutput(input.workspaceId, input.workItemId, input.outputId);
  if (!output) {
    const raced = (await getCreativeWork(input.workspaceId, input.workItemId))?.outputs.find(
      (candidate) => candidate.id === input.outputId,
    );
    return {
      ok: false,
      error: { code: "output_not_cancellable", status: raced?.status ?? "unknown" },
    };
  }

  const canonicalDecision = decideCreativeWorkRefund({
    surface: "quick_tool",
    failurePhase: "terminal",
    workItemId: input.workItemId,
    outputId: input.outputId,
  });
  const reactivation = await resolveCreativeWorkOutputReactivation({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    outputId: input.outputId,
    manualRetryAttempt: output.manualRetryAttempt,
  });
  const decision = reactivation && canonicalDecision.refund
    ? {
        ...canonicalDecision,
        idempotencyKey: reactivation.refundKey,
        reason: "creative_work_terminal_reactivation_failure",
      }
    : canonicalDecision;
  const settlement = await settleTerminalRefund({
    decision,
    workspaceId: input.workspaceId,
    userId: input.userId,
    metadata: {
      creativeWorkId: input.workItemId,
      outputId: input.outputId,
      reason: "generation_canceled",
      description: "creative_work_output_cancellation_refund",
    },
  });
  const refunded = settlement.applied;
  if (!refunded) {
    await markCreativeWorkOutputFailureCode(
      input.workspaceId,
      input.workItemId,
      input.outputId,
      "generation_canceled_refund_pending",
    );
  }

  try {
    await refreshCreativeWorkStatus(input.workspaceId, input.workItemId);
  } catch {
    // The output CAS and refund are already durable; aggregate status is a
    // follow-up projection and can be repaired by the next read.
  }

  const correlation = output.generationCorrelationId ?? existing.work.generationCorrelationId;
  const units = existing.outputs.filter((candidate) =>
    (candidate.generationCorrelationId ?? existing.work.generationCorrelationId) === correlation,
  );
  logCreativeWorkOutputTerminal({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    outputId: output.id,
    generationCorrelationId: correlation,
    protocol: "unknown",
    imageCallCount: output.imageCallCount,
    retryCount: output.retryCount,
    unitCount: units.length || 1,
    activeUnitCount: units.filter((unit) => unit.status === "processing").length,
    environment: process.env.RENDER_SERVICE_NAME ?? process.env.NODE_ENV ?? "unknown",
    outcome: "canceled",
    failureCode: "generation_canceled",
    refunded,
    durationMs: Math.max(0, (output.terminalAt ?? output.updatedAt).getTime() - (output.queuedAt ?? output.createdAt).getTime()),
  });

  try {
    const aggregate = await recordCreativeWorkGenerationAggregate(
      input.workspaceId,
      input.workItemId,
      correlation,
    );
    if (aggregate) {
      const fields = {
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        generationCorrelationId: aggregate.generationCorrelationId,
        unitCount: aggregate.unitCount,
        terminalCount: aggregate.terminalCount,
        successCount: aggregate.successCount,
        failureCount: aggregate.failureCount,
        result: aggregate.result,
        firstTerminalAt: aggregate.firstTerminalAt,
        completedAt: aggregate.completedAt,
        timeToFirstOutputMs: aggregate.timeToFirstOutputMs,
        totalDurationMs: aggregate.totalDurationMs,
      } as const;
      if (aggregate.firstTerminalEmitted) logCreativeWorkGenerationAggregate({ phase: "first_terminal", ...fields });
      if (aggregate.completionEmitted) logCreativeWorkGenerationAggregate({ phase: "completed", ...fields });
    }
  } catch {
    // Cancellation and its refund are already durable; aggregation is auxiliary.
  }

  return { ok: true, value: { output, refunded } };
}
