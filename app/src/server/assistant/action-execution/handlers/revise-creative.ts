import { getActionContract } from "@/server/assistant/action-contracts/registry";
import { emitArtifactIterationTelemetry } from "@/server/assistant/artifact-iteration-telemetry";
import { confirmCreativeRevision } from "@/server/assistant/creative-iteration/proposal";
import { logger } from "@/lib/logger";
import { getAssistantActionById } from "@/server/repositories/assistant-action";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { createDerivation } from "@/server/repositories/derivation";
import { campaignDerivationUnitSettlementAdapter } from "@/server/generation/settlement-adapters";
import { startGenerationSettlement } from "@/server/generation/settlement";
import { GENERATION_CREDIT_COSTS } from "@/server/generation/canonical/types";
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
  const campaignId = thread.campaignId;

  const inputSnapshot = parsed.data;

  const action = await getAssistantActionById(ctx.workspaceId, ctx.actionId);
  const jobRefs = Array.isArray(action?.jobRefs)
    ? (action!.jobRefs as unknown[])
    : [];
  const attempt = resolveAttemptIndex(ctx.inputSnapshot) + jobRefs.length;
  const idempotencyKey = buildRetryIdempotencyKey(ctx.actionId, attempt);

  const format =
    typeof ctx.inputSnapshot.format === "string"
      ? ctx.inputSnapshot.format
      : "1:1";

  const settled = await startGenerationSettlement(
    campaignDerivationUnitSettlementAdapter({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      campaignId,
      billingKey: idempotencyKey,
      amount: GENERATION_CREDIT_COSTS.singleDerivation,
      action: "image_derivation",
      intentMode: "creative_revision",
      eventIdPrefix: "assistant-revise",
      refundDescription: "assistant_revise_creative_dispatch_refund",
      locale: ctx.locale,
      assistantActionId: ctx.actionId,
      promptText: `Assistant revise creative ${ctx.actionId}`,
      targetFormat: format,
      async reserve() {
        const derivation = await createDerivation({
          campaignId,
          workspaceId: ctx.workspaceId,
          status: "queued",
          generationMode: "creative_revision",
          variantIndex: 0,
          format,
        });
        return { claimed: true, value: { derivation } };
      },
      buildEventData: (derivation) => ({
        derivationId: derivation.id,
        campaignId,
        workspaceId: ctx.workspaceId,
        triggeredByUserId: ctx.userId,
        locale: ctx.locale,
        generationMode: "creative_revision",
        variantIndex: 0,
        format: derivation.format ?? format,
        assistantActionId: ctx.actionId,
        planVersionId: inputSnapshot.planVersionId,
      }),
    })
  );

  if (!settled.ok) {
    if (settled.error.code === "credit_blocked") {
      throw new AssistantActionExecutionError(
        "Créditos insuficientes para esta revisão.",
        "credit_blocked"
      );
    }
    logger.error(
      `[executeReviseCreative] dispatch FAILED actionId=${ctx.actionId}`,
      settled.error
    );
    emitArtifactIterationTelemetry({
      scope: {
        workspaceId: ctx.workspaceId,
        clientProfileId: ctx.clientProfileId,
        campaignId,
        threadId: ctx.threadId,
      },
      eventKey: "generation_failed",
      metadata: {
        artifactType: "creative",
        actionId: ctx.actionId,
        reasonCode: "enqueue_failed",
      },
    });
    throw new AssistantActionExecutionError(
      "Falha ao enfileirar a geração da revisão do criativo.",
      "execution_failed"
    );
  }

  const derivation = settled.value.derivation;

  const confirmResult = await confirmCreativeRevision({
    scope: {
      workspaceId: ctx.workspaceId,
      clientProfileId: ctx.clientProfileId,
      campaignId,
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
    campaignId,
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

  const summary = confirmResult.idempotent
    ? "Revisão do criativo em processamento (ação já confirmada)."
    : "Revisão do criativo em processamento.";

  return {
    mode: "async" as const,
    jobRef: { kind: "derivation" as const, id: derivation.id },
    resultSummary: summary,
    campaignId,
  };
}