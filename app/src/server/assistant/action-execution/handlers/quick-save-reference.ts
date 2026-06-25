import { assertDerivationApprovable } from "@/server/ai/creative-quality-gate";
import { getActionContract } from "@/server/assistant/action-contracts/registry";
import { recordBrandMemoryEvent } from "@/server/memory/brand-memory-dispatch";
import { createClientReference } from "@/server/repositories/client-reference";
import { getDerivationById } from "@/server/repositories/derivation";
import type { ActionExecutionContext } from "../types";
import { AssistantActionExecutionError } from "../types";

export async function executeQuickSaveReference(ctx: ActionExecutionContext) {
  const contract = getActionContract("quick_save_reference");
  const parsed = contract?.inputSchema.safeParse(ctx.inputSnapshot);
  if (!parsed?.success) {
    throw new AssistantActionExecutionError(
      "Invalid quick_save_reference inputs",
      "execution_failed"
    );
  }

  const derivation = await getDerivationById(parsed.data.derivationId, ctx.workspaceId);
  if (!derivation) {
    throw new AssistantActionExecutionError("Derivation not found", "derivation_not_found");
  }
  if (derivation.status !== "approved") {
    throw new AssistantActionExecutionError(
      "Derivation must be approved",
      "execution_failed"
    );
  }
  if (!derivation.outputKey) {
    throw new AssistantActionExecutionError(
      "Derivation missing output",
      "execution_failed"
    );
  }

  const approvable = assertDerivationApprovable(derivation);
  if (!approvable.ok) {
    throw new AssistantActionExecutionError(
      "Derivation has hard failures",
      "execution_failed"
    );
  }

  const reference = await createClientReference(ctx.workspaceId, {
    clientProfileId: ctx.clientProfileId,
    assetKey: derivation.outputKey,
    label: parsed.data.label,
    kind: parsed.data.kind ?? "style",
    notes: parsed.data.notes,
    sourceDerivationId: derivation.id,
  });

  await recordBrandMemoryEvent({
    type: "creative_saved_as_reference",
    workspaceId: ctx.workspaceId,
    clientProfileId: ctx.clientProfileId,
    campaignId: derivation.campaignId,
    derivationId: derivation.id,
    occurredAt: reference.createdAt,
    summary: `Approved creative was saved as "${reference.label}" (${reference.kind}) from assistant quick action.`,
    payload: {
      action: "approved_creative_saved_as_reference",
      reference: {
        label: reference.label,
        kind: reference.kind,
        notes: reference.notes,
        assetKey: reference.assetKey,
      },
      derivation: {
        id: derivation.id,
        format: derivation.format,
        generationMode: derivation.generationMode,
      },
    },
  });

  return {
    mode: "sync" as const,
    resultSummary: `Reference saved (${reference.id})`,
  };
}
