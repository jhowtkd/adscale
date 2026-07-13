/**
 * Transições de ciclo de vida da derivação (Phase 3 / item 19).
 * Persistência apenas via repositories — sempre com workspaceId + id.
 */
import { refreshCampaignStatus } from "@/server/repositories/campaign";
import {
  completeDerivation,
  failDerivation,
  setDerivationProcessing,
} from "@/server/repositories/derivation";
import { syncAssistantActionFromJob } from "@/server/repositories/assistant-job-sync";
import { DERIVATION_USER_SAFE_ERROR } from "@/server/jobs/derivation-error-sanitizer";
import type { derivations } from "@/server/db/schema";

export async function markDerivationProcessing(input: {
  derivationId: string;
  workspaceId: string;
  assistantActionId?: string | null;
}): Promise<void> {
  await setDerivationProcessing(input.derivationId, input.workspaceId);
  if (input.assistantActionId) {
    await syncAssistantActionFromJob({
      workspaceId: input.workspaceId,
      actionId: input.assistantActionId,
      status: "processing",
      jobRef: { kind: "derivation", id: input.derivationId },
    });
  }
}

export async function markDerivationCompleted(input: {
  derivationId: string;
  campaignId: string;
  workspaceId: string;
  outputKey: string;
  prompt: string | null;
  candidates?: typeof derivations.$inferInsert.candidates;
  assistantActionId?: string | null;
  /** Goal runs sync via finalizeGoalDerivation — skip assistant sync here. */
  skipAssistantSync?: boolean;
}): Promise<void> {
  await completeDerivation(input.derivationId, input.workspaceId, {
    outputKey: input.outputKey,
    prompt: input.prompt,
    candidates: input.candidates,
  });
  await refreshCampaignStatus(input.campaignId, input.workspaceId);
  if (input.assistantActionId && !input.skipAssistantSync) {
    await syncAssistantActionFromJob({
      workspaceId: input.workspaceId,
      actionId: input.assistantActionId,
      status: "completed",
      jobRef: { kind: "derivation", id: input.derivationId },
    });
  }
}

export async function markDerivationFailed(input: {
  derivationId: string;
  campaignId: string;
  workspaceId: string;
  userMessage: string;
  assistantActionId?: string | null;
}): Promise<void> {
  await failDerivation(
    input.derivationId,
    input.workspaceId,
    input.userMessage
  );
  await refreshCampaignStatus(input.campaignId, input.workspaceId);
  if (input.assistantActionId) {
    await syncAssistantActionFromJob({
      workspaceId: input.workspaceId,
      actionId: input.assistantActionId,
      status: "failed",
      jobRef: { kind: "derivation", id: input.derivationId },
      safeError: DERIVATION_USER_SAFE_ERROR,
    });
  }
}
