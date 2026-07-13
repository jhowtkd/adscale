import { getActionContract } from "@/server/assistant/action-contracts/registry";
import { regenerateDerivation } from "@/server/application/regenerate-derivation";
import { reviewDerivation } from "@/server/application/review-derivation";
import type { ActionExecutionContext } from "../types";
import { AssistantActionExecutionError } from "../types";

export async function executeQuickRegenerate(ctx: ActionExecutionContext) {
  const contract = getActionContract("quick_regenerate");
  const parsed = contract?.inputSchema.safeParse(ctx.inputSnapshot);
  if (!parsed?.success) {
    throw new AssistantActionExecutionError(
      "Invalid quick_regenerate inputs",
      "execution_failed"
    );
  }

  const result = await regenerateDerivation({
    workspaceId: ctx.workspaceId,
    derivationId: parsed.data.derivationId,
    feedback: parsed.data.feedback?.trim() || undefined,
    userId: ctx.userId,
    locale: ctx.locale,
    billingIdempotencyKey: `assistant-action:${ctx.actionId}:quick_regenerate`,
    billingMetadata: {
      actionId: ctx.actionId,
      derivationId: parsed.data.derivationId,
    },
    assistantActionId: ctx.actionId,
    actorUserId: ctx.userId,
    evidenceSource: "assistant.quick_regenerate",
  });

  if (!result.ok) {
    switch (result.error.code) {
      case "derivation_not_found":
        throw new AssistantActionExecutionError(
          "Derivation not found",
          "derivation_not_found"
        );
      case "credit_blocked":
        throw new AssistantActionExecutionError(
          "Insufficient credits",
          "credit_blocked"
        );
      case "dispatch_failed":
        throw new AssistantActionExecutionError(
          "Failed to queue regeneration",
          "execution_failed"
        );
      default:
        throw new AssistantActionExecutionError(
          "Regeneration failed",
          "execution_failed"
        );
    }
  }

  return {
    mode: "async" as const,
    jobRef: { kind: "derivation" as const, id: result.value.derivation.id },
    resultSummary: `Regeneration queued (${result.value.derivation.id})`,
  };
}

export async function executeQuickReview(ctx: ActionExecutionContext) {
  const contract = getActionContract("quick_review");
  const parsed = contract?.inputSchema.safeParse(ctx.inputSnapshot);
  if (!parsed?.success) {
    throw new AssistantActionExecutionError("Invalid quick_review inputs", "execution_failed");
  }

  const result = await reviewDerivation({
    workspaceId: ctx.workspaceId,
    derivationId: parsed.data.derivationId,
    decision: parsed.data.decision,
    directionReason: parsed.data.directionReason,
    actorUserId: ctx.userId,
    evidenceSource: "assistant.quick_review",
  });

  if (!result.ok) {
    switch (result.error.code) {
      case "derivation_not_found":
        throw new AssistantActionExecutionError(
          "Derivation not found",
          "derivation_not_found"
        );
      case "derivation_hard_failures":
        throw new AssistantActionExecutionError(
          "Derivation has hard failures",
          "execution_failed"
        );
      case "invalid_direction_reason":
      case "invalid_input":
        throw new AssistantActionExecutionError(
          "Invalid quick_review inputs",
          "execution_failed"
        );
      default:
        throw new AssistantActionExecutionError(
          "Review failed",
          "execution_failed"
        );
    }
  }

  return {
    mode: "sync" as const,
    jobRef: { kind: "derivation" as const, id: result.value.derivation.id },
    resultSummary: `Review recorded as ${result.value.effectiveStatus} for ${result.value.campaign?.name ?? "campaign"}`,
  };
}
