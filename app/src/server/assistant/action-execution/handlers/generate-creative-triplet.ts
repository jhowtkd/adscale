import { generateCreativeTripletInputSchema } from "@/server/assistant/action-contracts/contracts/generate-creative-triplet";
import { getGoalRunScoped } from "@/server/repositories/assistant-goal";
import {
  createDerivation,
  updateDerivationStatus,
} from "@/server/repositories/derivation";
import { spendOrApiError } from "@/server/billing/paywall";
import { inngest } from "@/server/jobs/client";
import { heavyImageEventName } from "@/server/jobs/heavy-image-events";
import { GOAL_CREATIVE_LEVELS } from "@/lib/assistant/goal";
import { AssistantActionExecutionError } from "../types";
import type { ActionExecutionContext, ActionExecutionResult } from "../types";

/**
 * Materializes the controlled creative triplet: three `1:1` derivations bound
 * to the same plan, CTA, assets, and references, varying ONLY `creativeLevel`.
 *
 * Billing is definitive and non-refundable — a single 15-credit charge covers
 * all three candidates, and a technical failure on one derivation occupies its
 * slot as failed without refunding. The derivation job enforces `refundPolicy:
 * "none"` so the failure path never calls `refundCredits`.
 */
export async function executeGenerateCreativeTriplet(
  ctx: ActionExecutionContext
): Promise<ActionExecutionResult> {
  const parsed = generateCreativeTripletInputSchema.safeParse(ctx.inputSnapshot);
  if (!parsed.success) {
    throw new AssistantActionExecutionError("Invalid inputs", "execution_failed");
  }
  const input = parsed.data;

  // Reload the goal under the current scope and reject a stale proposal. The
  // confirm-time validator already checked this, but the handler is the last
  // line of defense before charging.
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

  // One charge for the whole batch. The idempotency key is scoped to the action
  // so a replay (e.g. retried dispatch) never double-charges.
  const creditError = await spendOrApiError({
    workspaceId: ctx.workspaceId,
    action: "image_derivation",
    amount: 15,
    idempotencyKey: `assistant-action:${ctx.actionId}:creative-triplet`,
    metadata: {
      actionId: ctx.actionId,
      goalRunId: input.goalRunId,
      count: GOAL_CREATIVE_LEVELS.length,
    },
    userId: ctx.userId,
  });
  if (creditError) {
    throw new AssistantActionExecutionError(
      "Insufficient credits",
      "credit_blocked"
    );
  }

  const jobRefs: ActionExecutionResult["jobRefs"] = [];

  // Create all three derivations up front, then dispatch. variantIndex stays 0
  // for every row: encoding the level in variantIndex would vary two prompt
  // inputs and invalidate the controlled experiment.
  const derivations = await Promise.all(
    GOAL_CREATIVE_LEVELS.map((creativeLevel) =>
      createDerivation({
        campaignId: goal.campaignId!,
        workspaceId: ctx.workspaceId,
        format: input.format,
        generationMode: "art_variation",
        variantIndex: 0,
        status: "queued",
        creativeLevel,
      })
    )
  );

  for (const derivation of derivations) {
    try {
      await inngest.send({
        name: heavyImageEventName("derivation.generate"),
        data: {
          derivationId: derivation.id,
          campaignId: goal.campaignId!,
          workspaceId: ctx.workspaceId,
          triggeredByUserId: ctx.userId,
          locale: ctx.locale,
          generationMode: "art_variation",
          creativeLevel: derivation.creativeLevel,
          format: input.format,
          variantIndex: 0,
          planVersionId: input.planVersionId,
          assistantActionId: ctx.actionId,
          goalRunId: input.goalRunId,
          refundPolicy: "none",
        },
      });
      jobRefs.push({ kind: "derivation", id: derivation.id });
    } catch {
      // Dispatch failed after the row was created and charged: mark this slot
      // failed without refunding. The other two candidates still run.
      // Status update is best-effort; the aggregate job sync handles the rest.
      await updateDerivationStatus(derivation.id, ctx.workspaceId, "failed");
      jobRefs.push({ kind: "derivation", id: derivation.id });
    }
  }

  return {
    mode: "async",
    jobRefs,
    resultSummary: "Três direções criativas disparadas",
    campaignId: goal.campaignId!,
  };
}
