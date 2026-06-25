import type { ActionStatus, JobRef } from "./assistant-types";
import {
  sanitizeSafeError,
  transitionAssistantAction,
} from "./assistant-action";

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

  return transitionAssistantAction(input.workspaceId, input.actionId, nextStatus, {
    jobRef: input.jobRef,
    safeError: sanitizeSafeError(input.safeError),
  });
}
