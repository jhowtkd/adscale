import {
  generateGoalPackageInputSchema,
  PACKAGE_CHILD_FORMATS,
} from "@/server/assistant/action-contracts/contracts/generate-goal-package";
import { getGoalRunScoped } from "@/server/repositories/assistant-goal";
import { resolveGoalCreativeVersion } from "@/server/assistant/goal/service";
import { GENERATION_CREDIT_COSTS } from "@/server/generation/canonical/types";
import { assistantGoalPackageSettlementAdapter } from "@/server/generation/settlement-adapters";
import { startGenerationSettlement } from "@/server/generation/settlement";
import { AssistantActionExecutionError } from "../types";
import type { ActionExecutionContext, ActionExecutionResult } from "../types";

/**
 * Generates the three missing package formats (4:5, 9:16, 16:9) from the
 * approved 1:1 base. Settlement owns charge/reserve/dispatch/compensation.
 */
export async function executeGenerateGoalPackage(
  ctx: ActionExecutionContext
): Promise<ActionExecutionResult> {
  const parsed = generateGoalPackageInputSchema.safeParse(ctx.inputSnapshot);
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
    throw new AssistantActionExecutionError("Goal scope mismatch", "execution_failed");
  }
  if (goal.revision !== input.goalRevision) {
    throw new AssistantActionExecutionError("Stale goal revision", "execution_failed");
  }
  if (!goal.campaignId) {
    throw new AssistantActionExecutionError("Goal has no campaign", "execution_failed");
  }

  const base = await resolveGoalCreativeVersion(goal, input.baseVersionId);
  if (!base) {
    throw new AssistantActionExecutionError("Base not found", "derivation_not_found");
  }

  const settled = await startGenerationSettlement(
    assistantGoalPackageSettlementAdapter({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      campaignId: goal.campaignId,
      actionId: ctx.actionId,
      baseDerivation: base.derivation,
      formats: PACKAGE_CHILD_FORMATS,
      planVersionId: input.planVersionId,
      goalRunId: input.goalRunId,
      locale: ctx.locale,
      amount: GENERATION_CREDIT_COSTS.goalPackage,
      unitChargeAmount: GENERATION_CREDIT_COSTS.singleDerivation,
    }),
  );

  if (!settled.ok) {
    if (settled.error.code === "credit_blocked") {
      throw new AssistantActionExecutionError("Insufficient credits", "credit_blocked");
    }
    throw new AssistantActionExecutionError(
      "Failed to queue goal package",
      "execution_failed"
    );
  }

  return {
    mode: "async",
    jobRefs: settled.value.derivations.map((derivation) => ({
      kind: "derivation" as const,
      id: derivation.id,
    })),
    resultSummary: "Pacote de formatos disparado",
    campaignId: goal.campaignId,
  };
}
