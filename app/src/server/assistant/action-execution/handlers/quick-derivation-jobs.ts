import { getActionContract } from "@/server/assistant/action-contracts/registry";
import { adaptFormat } from "@/server/application/adapt-format";
import { prepareDeliveryPackage } from "@/server/application/prepare-delivery-package";
import type { ActionExecutionContext } from "../types";
import { AssistantActionExecutionError } from "../types";

export async function executeQuickFormatAdapt(ctx: ActionExecutionContext) {
  const contract = getActionContract("quick_format_adapt");
  const parsed = contract?.inputSchema.safeParse(ctx.inputSnapshot);
  if (!parsed?.success) {
    throw new AssistantActionExecutionError(
      "Invalid quick_format_adapt inputs",
      "execution_failed"
    );
  }

  const result = await adaptFormat({
    workspaceId: ctx.workspaceId,
    sourceDerivationId: parsed.data.sourceDerivationId,
    targetFormat: parsed.data.targetFormat,
    userId: ctx.userId,
    locale: ctx.locale,
    billingIdempotencyKey: `assistant-action:${ctx.actionId}:quick_format_adapt`,
    billingMetadata: {
      actionId: ctx.actionId,
      sourceDerivationId: parsed.data.sourceDerivationId,
      targetFormat: parsed.data.targetFormat,
    },
    assistantActionId: ctx.actionId,
  });

  if (!result.ok) {
    switch (result.error.code) {
      case "derivation_not_found":
        throw new AssistantActionExecutionError(
          "Source derivation not found",
          "derivation_not_found"
        );
      case "source_missing_output":
        throw new AssistantActionExecutionError(
          "Source derivation has no output",
          "execution_failed"
        );
      case "credit_blocked":
        throw new AssistantActionExecutionError(
          "Insufficient credits",
          "credit_blocked"
        );
      case "dispatch_failed":
        throw new AssistantActionExecutionError(
          "Failed to queue format adaptation",
          "execution_failed"
        );
      default:
        throw new AssistantActionExecutionError(
          "Format adaptation failed",
          "execution_failed"
        );
    }
  }

  return {
    mode: "async" as const,
    jobRef: { kind: "derivation" as const, id: result.value.derivation.id },
    resultSummary: `Format adaptation queued (${result.value.derivation.id})`,
  };
}

export async function executeQuickPackage(ctx: ActionExecutionContext) {
  const contract = getActionContract("quick_package");
  const parsed = contract?.inputSchema.safeParse(ctx.inputSnapshot);
  if (!parsed?.success) {
    throw new AssistantActionExecutionError("Invalid quick_package inputs", "execution_failed");
  }

  const result = await prepareDeliveryPackage({
    workspaceId: ctx.workspaceId,
    sourceDerivationId: parsed.data.sourceDerivationId,
    formats: parsed.data.formats,
    userId: ctx.userId,
    locale: ctx.locale,
    billingIdempotencyKey: `assistant-action:${ctx.actionId}:quick_package`,
    billingMetadata: {
      actionId: ctx.actionId,
      sourceDerivationId: parsed.data.sourceDerivationId,
    },
    assistantActionId: ctx.actionId,
    // Assistente still expects at least one new format (historical contract).
    requireGeneratableFormats: true,
  });

  if (!result.ok) {
    switch (result.error.code) {
      case "derivation_not_found":
        throw new AssistantActionExecutionError(
          "Source derivation not found",
          "derivation_not_found"
        );
      case "source_not_approved":
        throw new AssistantActionExecutionError(
          "Source derivation must be approved",
          "execution_failed"
        );
      case "source_missing_output":
        throw new AssistantActionExecutionError(
          "Source derivation missing output",
          "execution_failed"
        );
      case "derivation_hard_failures":
        throw new AssistantActionExecutionError(
          "Source derivation has hard failures",
          "execution_failed"
        );
      case "no_formats_to_generate":
        throw new AssistantActionExecutionError(
          "No additional formats to generate",
          "execution_failed"
        );
      case "credit_blocked":
        throw new AssistantActionExecutionError(
          "Insufficient credits",
          "credit_blocked"
        );
      default:
        throw new AssistantActionExecutionError(
          "Package preparation failed",
          "execution_failed"
        );
    }
  }

  const firstQueued = result.value.queued[0];
  if (!firstQueued) {
    // All formats ready or already active — success without new job.
    return {
      mode: "sync" as const,
      resultSummary: `Delivery package ready (formats: ${result.value.readyFormats.join(", ") || "none new"})`,
    };
  }

  return {
    mode: "async" as const,
    jobRef: { kind: "derivation" as const, id: firstQueued.id },
    resultSummary: `Package formats queued (${result.value.queued.length})`,
  };
}
