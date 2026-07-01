import { getActionContract } from "@/server/assistant/action-contracts/registry";
import { emitArtifactIterationTelemetry } from "@/server/assistant/artifact-iteration-telemetry";
import { confirmCreativeRevision } from "@/server/assistant/creative-iteration/proposal";
import { spendOrApiError } from "@/server/billing/paywall";
import { logger } from "@/lib/logger";
import { getAssistantActionById } from "@/server/repositories/assistant-action";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import {
  createDerivation,
  updateDerivationStatus,
} from "@/server/repositories/derivation";
import { inngest } from "@/server/jobs/client";
import type { ActionExecutionContext, ActionExecutionResult } from "../types";
import { AssistantActionExecutionError } from "../types";

function buildRetryIdempotencyKey(actionId: string, attemptIndex: number) {
  return `assistant-action:${actionId}:creative_revision:retry:${attemptIndex}`;
}

function resolveAttemptIndex(inputSnapshot: Record<string, unknown>): number {
  const raw = inputSnapshot.__retryAttemptIndex;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return Math.floor(raw);
  }
  return 0;
}

export async function executeReviseCreative(
  ctx: ActionExecutionContext
): Promise<ActionExecutionResult> {
  const contract = getActionContract("revise_creative");
  const parsed = contract?.inputSchema.safeParse(ctx.inputSnapshot);
  if (!parsed?.success) {
    throw new AssistantActionExecutionError(
      "Invalid creative revision inputs",
      "execution_failed"
    );
  }

  const thread = await getAssistantThreadById(ctx.workspaceId, ctx.threadId);
  if (!thread?.campaignId) {
    throw new AssistantActionExecutionError("Thread scope mismatch", "scope_mismatch");
  }
  if (thread.clientProfileId !== ctx.clientProfileId) {
    throw new AssistantActionExecutionError("Client scope mismatch", "scope_mismatch");
  }

  const inputSnapshot = parsed.data;

  const action = await getAssistantActionById(ctx.workspaceId, ctx.actionId);
  const jobRefs = Array.isArray(action?.jobRefs)
    ? (action!.jobRefs as unknown[])
    : [];
  const attempt = resolveAttemptIndex(ctx.inputSnapshot) + jobRefs.length;
  const idempotencyKey = buildRetryIdempotencyKey(ctx.actionId, attempt);

  const creditError = await spendOrApiError({
    workspaceId: ctx.workspaceId,
    action: "image_derivation",
    amount: 5,
    idempotencyKey,
    metadata: {
      actionId: ctx.actionId,
      campaignId: thread.campaignId,
      mode: "creative_revision",
      attempt,
    },
    userId: ctx.userId,
  });
  if (creditError) {
    throw new AssistantActionExecutionError(
      "Créditos insuficientes para esta revisão.",
      "credit_blocked"
    );
  }

  const confirmResult = await confirmCreativeRevision({
    scope: {
      workspaceId: ctx.workspaceId,
      clientProfileId: ctx.clientProfileId,
      campaignId: thread.campaignId,
      threadId: ctx.threadId,
    },
    proposalId: inputSnapshot.proposalId,
    lineageId: inputSnapshot.lineageId,
    sourceVersionId: inputSnapshot.sourceVersionId,
    payloadDigest: inputSnapshot.payloadDigest,
    lineageHeadRevision: inputSnapshot.lineageHeadRevision,
    actionId: ctx.actionId,
  });

  const artifactScope = {
    workspaceId: ctx.workspaceId,
    clientProfileId: ctx.clientProfileId,
    campaignId: thread.campaignId,
    threadId: ctx.threadId,
  };

  if (attempt > 0) {
    emitArtifactIterationTelemetry({
      scope: artifactScope,
      eventKey: "retry_requested",
      metadata: {
        artifactType: "creative",
        actionId: ctx.actionId,
        isRetry: true,
      },
    });
  }

  const format =
    typeof ctx.inputSnapshot.format === "string"
      ? ctx.inputSnapshot.format
      : "1:1";

  const derivation = await createDerivation({
    campaignId: thread.campaignId,
    workspaceId: ctx.workspaceId,
    status: "queued",
    generationMode: "creative_revision",
    variantIndex: 0,
    format,
  });

  try {
    await inngest.send({
      name: "derivation.generate",
      data: {
        derivationId: derivation.id,
        campaignId: thread.campaignId,
        workspaceId: ctx.workspaceId,
        triggeredByUserId: ctx.userId,
        locale: ctx.locale,
        generationMode: "creative_revision",
        variantIndex: 0,
        format: derivation.format ?? format,
        assistantActionId: ctx.actionId,
        planVersionId: inputSnapshot.planVersionId,
      },
    });
    emitArtifactIterationTelemetry({
      scope: artifactScope,
      eventKey: "generation_enqueued",
      metadata: {
        artifactType: "creative",
        lineageId: inputSnapshot.lineageId,
        actionId: ctx.actionId,
        proposalId: inputSnapshot.proposalId,
        headRevision: inputSnapshot.lineageHeadRevision,
      },
    });
  } catch (sendErr) {
    logger.error(
      `[executeReviseCreative] event send FAILED derivationId=${derivation.id}`,
      sendErr
    );
    emitArtifactIterationTelemetry({
      scope: artifactScope,
      eventKey: "generation_failed",
      metadata: {
        artifactType: "creative",
        actionId: ctx.actionId,
        reasonCode: "enqueue_failed",
      },
    });
    await updateDerivationStatus(derivation.id, ctx.workspaceId, "failed");
    throw new AssistantActionExecutionError(
      "Falha ao enfileirar a geração da revisão do criativo.",
      "execution_failed"
    );
  }

  const summary = confirmResult.idempotent
    ? "Revisão do criativo em processamento (ação já confirmada)."
    : "Revisão do criativo em processamento.";

  return {
    mode: "async" as const,
    jobRef: { kind: "derivation" as const, id: derivation.id },
    resultSummary: summary,
    campaignId: thread.campaignId,
  };
}
