import { getActionContract } from "@/server/assistant/action-contracts/registry";
import { confirmPlanRevision } from "@/server/assistant/plan-iteration/proposal";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import type { ArtifactScope } from "@/server/repositories/artifact-version";
import type { ActionExecutionContext, ActionExecutionResult } from "../types";
import { AssistantActionExecutionError } from "../types";

export async function executeReviseCreativePlan(
  ctx: ActionExecutionContext
): Promise<ActionExecutionResult> {
  const contract = getActionContract("revise_creative_plan");
  const parsed = contract?.inputSchema.safeParse(ctx.inputSnapshot);
  if (!parsed?.success) {
    throw new AssistantActionExecutionError("Invalid plan revision inputs", "execution_failed");
  }

  const thread = await getAssistantThreadById(ctx.workspaceId, ctx.threadId);
  if (!thread?.campaignId) {
    throw new AssistantActionExecutionError("Thread scope mismatch", "scope_mismatch");
  }
  if (thread.clientProfileId !== ctx.clientProfileId) {
    throw new AssistantActionExecutionError("Client scope mismatch", "scope_mismatch");
  }

  const scope: ArtifactScope = {
    workspaceId: ctx.workspaceId,
    clientProfileId: ctx.clientProfileId,
    campaignId: thread.campaignId,
    threadId: ctx.threadId,
  };

  try {
    const result = await confirmPlanRevision({
      scope,
      proposalId: parsed.data.proposalId,
      lineageId: parsed.data.lineageId,
      sourceVersionId: parsed.data.sourceVersionId,
      payloadDigest: parsed.data.payloadDigest,
      lineageHeadRevision: parsed.data.lineageHeadRevision,
      actionId: ctx.actionId,
      messageId: null,
    });

    const versionNumber = result.version.versionNumber;
    return {
      mode: "sync",
      resultSummary: result.idempotent
        ? `Plano ${versionNumber} já confirmado para esta ação.`
        : `Plano v${versionNumber} criado em status pronto.`,
      campaignId: thread.campaignId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Não foi possível confirmar a revisão do plano.";
    throw new AssistantActionExecutionError(message, "execution_failed");
  }
}
