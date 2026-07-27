import { reviseCreativeAnnotationsInputSchema } from "@/server/assistant/action-contracts/contracts/revise-creative-annotations";
import {
  getGoalRunScoped,
  listAnnotationsForVersion,
  markAnnotationsAddressed,
} from "@/server/repositories/assistant-goal";
import { createDerivation } from "@/server/repositories/derivation";
import { resolveGoalCreativeVersion } from "@/server/assistant/goal/service";
import { campaignDerivationUnitSettlementAdapter } from "@/server/generation/settlement-adapters";
import { startGenerationSettlement } from "@/server/generation/settlement";
import { GENERATION_CREDIT_COSTS } from "@/server/generation/canonical/types";
import { AssistantActionExecutionError } from "../types";
import type { ActionExecutionContext, ActionExecutionResult } from "../types";

/**
 * Consumes one submitted annotation batch and dispatches a single
 * non-refundable revision. The handler reloads and validates every annotation
 * server-side (the client only sent opaque ids), charges 5 credits once, and
 * creates a child derivation whose `parentId` is the source so the revision
 * uses the parent's output as the base image. Annotations stay attached to the
 * source version; they are marked `addressed` only after the new version lands.
 */
export async function executeReviseCreativeAnnotations(
  ctx: ActionExecutionContext
): Promise<ActionExecutionResult> {
  const parsed = reviseCreativeAnnotationsInputSchema.safeParse(ctx.inputSnapshot);
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
  const campaignId = goal.campaignId;

  // Server-side authority: reload the frozen annotations for the source version
  // and confirm every requested id is present and submitted. The model never
  // chooses annotation content; it only quotes ids.
  const annotations = await listAnnotationsForVersion(
    ctx.workspaceId,
    input.goalRunId,
    input.sourceVersionId
  );
  const submitted = annotations.filter(
    (a) => input.annotationIds.includes(a.id) && a.status === "submitted"
  );
  if (submitted.length !== input.annotationIds.length) {
    throw new AssistantActionExecutionError(
      "Annotation batch mismatch",
      "execution_failed"
    );
  }

  const source = await resolveGoalCreativeVersion(goal, input.sourceVersionId);
  if (!source) {
    throw new AssistantActionExecutionError("Source not found", "derivation_not_found");
  }
  const sourceDerivation = source.derivation;

  const settled = await startGenerationSettlement(
    campaignDerivationUnitSettlementAdapter({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      campaignId,
      billingKey: `assistant-action:${ctx.actionId}:annotation-revision`,
      amount: GENERATION_CREDIT_COSTS.singleDerivation,
      action: "image_derivation",
      intentMode: "creative_revision",
      eventIdPrefix: "assistant-annotation-revision",
      refundDescription: "assistant_annotation_revision_dispatch_refund",
      locale: ctx.locale,
      assistantActionId: ctx.actionId,
      promptText: `Assistant annotation revision ${ctx.actionId}`,
      targetFormat: "1:1",
      parentId: sourceDerivation.id,
      async reserve() {
        const child = await createDerivation({
          campaignId,
          workspaceId: ctx.workspaceId,
          parentId: sourceDerivation.id,
          format: "1:1",
          generationMode: "creative_revision",
          variantIndex: 0,
          status: "queued",
          creativeLevel:
            (sourceDerivation?.creativeLevel as
              | "conservative"
              | "balanced"
              | "bold"
              | "extreme"
              | undefined) ?? "balanced",
        });
        return { claimed: true, value: { derivation: child } };
      },
      buildEventData: (derivation) => ({
        derivationId: derivation.id,
        campaignId,
        workspaceId: ctx.workspaceId,
        triggeredByUserId: ctx.userId,
        locale: ctx.locale,
        generationMode: "creative_revision",
        format: "1:1",
        variantIndex: 0,
        planVersionId: input.planVersionId,
        assistantActionId: ctx.actionId,
        goalRunId: input.goalRunId,
        refundPolicy: "none",
      }),
    })
  );

  if (!settled.ok) {
    if (settled.error.code === "credit_blocked") {
      throw new AssistantActionExecutionError("Insufficient credits", "credit_blocked");
    }
    throw new AssistantActionExecutionError(
      "Falha ao enfileirar a revisão anotada.",
      "execution_failed"
    );
  }

  // The goal callback (in derivationJob) marks annotations `addressed` only
  // after the new version settles. We do not mark them here.
  void markAnnotationsAddressed;

  return {
    mode: "async",
    jobRefs: [{ kind: "derivation", id: settled.value.derivation.id }],
    resultSummary: "Revisão anotada disparada",
    campaignId,
  };
}