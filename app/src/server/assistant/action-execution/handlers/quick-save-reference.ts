import { getActionContract } from "@/server/assistant/action-contracts/registry";
import { saveDerivationReference } from "@/server/application/save-derivation-reference";
import type { ActionExecutionContext } from "../types";
import { AssistantActionExecutionError } from "../types";

/**
 * Assistente adapter for save-reference — transport only.
 * Business rules live in `saveDerivationReference` (shared with HTTP).
 */
export async function executeQuickSaveReference(ctx: ActionExecutionContext) {
  const contract = getActionContract("quick_save_reference");
  const parsed = contract?.inputSchema.safeParse(ctx.inputSnapshot);
  if (!parsed?.success) {
    throw new AssistantActionExecutionError(
      "Invalid quick_save_reference inputs",
      "execution_failed"
    );
  }

  const result = await saveDerivationReference({
    workspaceId: ctx.workspaceId,
    derivationId: parsed.data.derivationId,
    clientProfileId: ctx.clientProfileId,
    label: parsed.data.label,
    kind: parsed.data.kind,
    notes: parsed.data.notes,
  });

  if (!result.ok) {
    switch (result.error.code) {
      case "derivation_not_found":
        throw new AssistantActionExecutionError(
          "Derivation not found",
          "derivation_not_found"
        );
      case "derivation_not_approved":
        throw new AssistantActionExecutionError(
          "Derivation must be approved",
          "execution_failed"
        );
      case "derivation_missing_output":
        throw new AssistantActionExecutionError(
          "Derivation missing output",
          "execution_failed"
        );
      case "derivation_hard_failures":
        throw new AssistantActionExecutionError(
          "Derivation has hard failures",
          "execution_failed"
        );
      case "client_profile_not_found":
        throw new AssistantActionExecutionError(
          "Client profile not found",
          "execution_failed"
        );
      default:
        throw new AssistantActionExecutionError(
          "Failed to save reference",
          "execution_failed"
        );
    }
  }

  return {
    mode: "sync" as const,
    resultSummary: `Reference saved (${result.value.reference.id})`,
  };
}
