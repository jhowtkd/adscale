import { generateCreativeTripletInputSchema } from "@/server/assistant/action-contracts/contracts/generate-creative-triplet";
import { getGoalRunScoped } from "@/server/repositories/assistant-goal";
import { assistantCreativeTripletSettlementAdapter } from "@/server/generation/settlement-adapters";
import { startGenerationSettlement } from "@/server/generation/settlement";
import { AssistantActionExecutionError } from "../types";
import type { ActionExecutionContext, ActionExecutionResult } from "../types";

/**
 * Materializes the controlled creative triplet: three `1:1` derivations bound
 * to the same plan, CTA, assets, and references, varying ONLY `creativeLevel`.
 *
 * Settlement owns charge/reserve/dispatch/compensation. Terminal job failures
 * remain non-refundable via `refundPolicy: "none"` on the derivation events.
 */
export async function executeGenerateCreativeTriplet(
  ctx: ActionExecutionContext
): Promise<ActionExecutionResult> {
  const parsed = generateCreativeTripletInputSchema.safeParse(ctx.inputSnapshot);
  if (!parsed.success) {
    throw new AssistantActionExecutionError("Invalid inputs", "execution_failed");
  }
  const input = parsed.data;

  const goal = await getGoalRunScoped(
    ctx.workspaceId,
    ctx.clientProfileId,
    ctx.threadId
  );
  if (!goal || goal.id !== input.goalRunId) {
    throw new AssistantActionExecutionError(
      "Goal scope mismatch",
      "execution_failed"
    );
  }
  if (goal.revision !== input.goalRevision) {
    throw new AssistantActionExecutionError(
      "Stale goal revision",
      "execution_failed"
    );
  }
  if (!goal.campaignId) {
    throw new AssistantActionExecutionError(
      "Goal has no campaign",
      "execution_failed"
    );
  }

  const settled = await startGenerationSettlement(
    assistantCreativeTripletSettlementAdapter({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      campaignId: goal.campaignId,
      actionId: ctx.actionId,
      format: input.format,
      planVersionId: input.planVersionId,
      goalRunId: input.goalRunId,
      locale: ctx.locale,
    }),
  );

  if (!settled.ok) {
    if (settled.error.code === "credit_blocked") {
      throw new AssistantActionExecutionError(
        "Insufficient credits",
        "credit_blocked"
      );
    }
    throw new AssistantActionExecutionError(
      "Failed to queue creative triplet",
      "execution_failed"
    );
  }

  return {
    mode: "async",
    jobRefs: settled.value.derivations.map((derivation) => ({
      kind: "derivation" as const,
      id: derivation.id,
    })),
    resultSummary: "Três direções criativas disparadas",
    campaignId: goal.campaignId,
  };
}
