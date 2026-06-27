import type { ActionStatus, JobRef } from "./assistant-types";
import {
  getAssistantActionById,
  sanitizeSafeError,
  transitionAssistantAction,
} from "./assistant-action";
import { getAssistantThreadById } from "./assistant-thread";
import { transitionGuidedFlowAfterAction } from "@/server/assistant/guided-paths/action-integration";

export type DerivationJobStatus = "processing" | "completed" | "failed";

const STATUS_MAP: Record<DerivationJobStatus, ActionStatus> = {
  processing: "running",
  completed: "completed",
  failed: "failed",
};

export interface SyncAssistantActionFromJobInput {
  workspaceId: string;
  actionId: string;
  status: DerivationJobStatus;
  jobRef?: JobRef;
  safeError?: string | null;
}

export async function syncAssistantActionFromJob(input: SyncAssistantActionFromJobInput) {
  const nextStatus = STATUS_MAP[input.status];

  const updated = await transitionAssistantAction(input.workspaceId, input.actionId, nextStatus, {
    jobRef: input.jobRef,
    safeError: sanitizeSafeError(input.safeError),
  });
  if (input.status === "completed" || input.status === "failed") {
    const action = await getAssistantActionById(input.workspaceId, input.actionId);
    const thread = action
      ? await getAssistantThreadById(input.workspaceId, action.threadId)
      : null;
    if (action && thread) {
      await transitionGuidedFlowAfterAction({
        workspaceId: input.workspaceId,
        threadId: action.threadId,
        clientProfileId: thread.clientProfileId,
        actionId: input.actionId,
        result: input.status,
        safeError: input.safeError ?? undefined,
        campaignId: thread.campaignId,
      }).catch(() => null);
    }
  }
  return updated;
}
