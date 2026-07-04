import { generateGoalPackageInputSchema, PACKAGE_CHILD_FORMATS } from "@/server/assistant/action-contracts/contracts/generate-goal-package";
import { getGoalRunScoped } from "@/server/repositories/assistant-goal";
import {
  createPackageChildIfAbsent,
  updateDerivationStatus,
} from "@/server/repositories/derivation";
import { resolveGoalCreativeVersion } from "@/server/assistant/goal/service";
import { spendOrApiError } from "@/server/billing/paywall";
import { inngest } from "@/server/jobs/client";
import { AssistantActionExecutionError } from "../types";
import type { ActionExecutionContext, ActionExecutionResult } from "../types";

/**
 * Generates the three missing package formats (4:5, 9:16, 16:9) from the
 * approved 1:1 base. Reuses the existing package-child creation logic so legacy
 * and goal paths stay in sync. The base's creative level, copy, offer, and CTA
 * are preserved on every child — format adaptation varies only layout.
 *
 * Billing is definitive and non-refundable: one 15-credit charge covers all
 * three children.
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
  const baseDerivation = base.derivation;

  const creditError = await spendOrApiError({
    workspaceId: ctx.workspaceId,
    action: "delivery_package_child",
    amount: 15,
    idempotencyKey: `assistant-action:${ctx.actionId}:goal-package`,
    metadata: {
      actionId: ctx.actionId,
      goalRunId: input.goalRunId,
      baseVersionId: input.baseVersionId,
      formats: PACKAGE_CHILD_FORMATS,
    },
    userId: ctx.userId,
  });
  if (creditError) {
    throw new AssistantActionExecutionError("Insufficient credits", "credit_blocked");
  }

  const jobRefs: ActionExecutionResult["jobRefs"] = [];

  for (const format of PACKAGE_CHILD_FORMATS) {
    const { child } = await createPackageChildIfAbsent({
      campaignId: goal.campaignId,
      workspaceId: ctx.workspaceId,
      parentId: baseDerivation.id,
      format,
      generationMode: "format_adaptation",
      status: "queued",
      ...(baseDerivation.ctaText ? { ctaText: baseDerivation.ctaText } : {}),
      creativeLevel:
        (baseDerivation.creativeLevel as "conservative" | "balanced" | "bold" | "extreme" | undefined) ??
        "balanced",
    });

    try {
      await inngest.send({
        name: "derivation.generate",
        data: {
          derivationId: child.id,
          campaignId: goal.campaignId,
          workspaceId: ctx.workspaceId,
          triggeredByUserId: ctx.userId,
          locale: ctx.locale,
          generationMode: "format_adaptation",
          format,
          variantIndex: 0,
          planVersionId: input.planVersionId,
          assistantActionId: ctx.actionId,
          goalRunId: input.goalRunId,
          refundPolicy: "none",
        },
      });
    } catch {
      await updateDerivationStatus(child.id, ctx.workspaceId, "failed");
    }
    jobRefs.push({ kind: "derivation", id: child.id });
  }

  return {
    mode: "async",
    jobRefs,
    resultSummary: "Pacote de formatos disparado",
    campaignId: goal.campaignId,
  };
}
