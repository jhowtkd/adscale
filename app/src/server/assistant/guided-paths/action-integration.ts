import { journeyStateFromRow } from "@/server/assistant/guided-conversation/state";
import { transitionJourney } from "@/server/assistant/guided-conversation/transition";
import {
  applyGuidedFlowCommand,
  getGuidedFlowByThread,
} from "@/server/repositories/guided-flow";
import { getGuidedFlowTransitionByCommand } from "@/server/repositories/guided-flow-transition";

export async function transitionGuidedFlowAfterAction(input: {
  workspaceId: string;
  threadId: string;
  clientProfileId: string;
  actionId: string;
  result: "running" | "completed" | "failed" | "canceled";
  safeError?: string;
  campaignId?: string | null;
}) {
  const flow = await getGuidedFlowByThread(input.workspaceId, input.threadId);
  if (!flow || flow.path === "unclassified") return flow;
  const commandId = `action:${input.actionId}:${input.result}`;
  const existing = await getGuidedFlowTransitionByCommand(flow.id, commandId);
  if (existing) return flow;

  const state = journeyStateFromRow(flow);
  const command =
    input.result === "running"
      ? ({ type: "action_started", campaignId: input.campaignId } as const)
      : input.result === "completed"
        ? ({ type: "action_completed", campaignId: input.campaignId } as const)
      : input.result === "failed"
        ? ({
            type: "action_failed",
            safeError: input.safeError ?? "Não foi possível executar esta ação.",
          } as const)
        : ({ type: "action_canceled" } as const);
  const next = transitionJourney(state, command).state;

  return applyGuidedFlowCommand({
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    clientProfileId: input.clientProfileId,
    commandId,
    commandType: command.type,
    expectedRevision: state.revision,
    previousStep: state.currentStep,
    nextStep: next.currentStep,
    patch: {
      path: next.path,
      status: next.status,
      currentStep: next.currentStep,
      slots: next.slots as Record<string, unknown>,
      missingFields: next.missingFields,
      assetIds: next.assetIds,
      referenceIds: next.referenceIds,
      campaignId: next.campaignId,
      revision: state.revision + 1,
      schemaVersion: next.schemaVersion,
      recoverableError: next.recoverableError,
    },
    metadata: { actionResult: input.result },
  });
}

export async function resumeGuidedFlowAfterActionFailure(input: {
  workspaceId: string;
  threadId: string;
  clientProfileId: string;
  safeError: string;
  actionId?: string;
}) {
  return transitionGuidedFlowAfterAction({
    ...input,
    actionId: input.actionId ?? crypto.randomUUID(),
    result: "failed",
  });
}

export async function clearGuidedFlowActionBlock(input: {
  workspaceId: string;
  threadId: string;
  clientProfileId: string;
}) {
  const flow = await getGuidedFlowByThread(input.workspaceId, input.threadId);
  if (!flow || flow.status !== "blocked") return flow;
  const state = journeyStateFromRow(flow);
  const next = transitionJourney(state, { type: "clear_error" }).state;
  return applyGuidedFlowCommand({
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    clientProfileId: input.clientProfileId,
    commandId: crypto.randomUUID(),
    commandType: "clear_error",
    expectedRevision: state.revision,
    previousStep: state.currentStep,
    nextStep: next.currentStep,
    patch: {
      path: next.path,
      status: "active",
      currentStep: next.currentStep,
      slots: next.slots as Record<string, unknown>,
      missingFields: next.missingFields,
      assetIds: next.assetIds,
      referenceIds: next.referenceIds,
      campaignId: next.campaignId,
      revision: state.revision + 1,
      schemaVersion: next.schemaVersion,
      recoverableError: null,
    },
  });
}
