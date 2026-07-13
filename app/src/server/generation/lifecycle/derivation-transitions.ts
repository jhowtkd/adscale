/**
 * Transições de ciclo de vida da derivação (Phase 3 / item 19).
 * Espelha o comportamento atual do job — sem mudar contratos externos.
 */
import { db } from "@/server/db";
import { derivations } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { refreshCampaignStatus } from "@/server/repositories/campaign";
import { syncAssistantActionFromJob } from "@/server/repositories/assistant-job-sync";
import { DERIVATION_USER_SAFE_ERROR } from "@/server/jobs/derivation-error-sanitizer";

export async function markDerivationProcessing(input: {
  derivationId: string;
  workspaceId: string;
  assistantActionId?: string | null;
}): Promise<void> {
  await db
    .update(derivations)
    .set({ status: "processing", updatedAt: new Date() })
    .where(eq(derivations.id, input.derivationId));
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
  candidates?: unknown;
  assistantActionId?: string | null;
  /** Goal runs sync via finalizeGoalDerivation — skip assistant sync here. */
  skipAssistantSync?: boolean;
}): Promise<void> {
  await db
    .update(derivations)
    .set({
      status: "completed",
      outputKey: input.outputKey,
      prompt: input.prompt,
      ...(input.candidates !== undefined
        ? {
            candidates: input.candidates as typeof derivations.$inferInsert.candidates,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(derivations.id, input.derivationId));
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
  await db
    .update(derivations)
    .set({
      status: "failed",
      prompt: input.userMessage,
      updatedAt: new Date(),
    })
    .where(eq(derivations.id, input.derivationId));
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
