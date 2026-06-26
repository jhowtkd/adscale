import {
  getGuidedFlowByThread,
  patchGuidedFlow,
} from "@/server/repositories/guided-flow";

export async function resumeGuidedFlowAfterActionFailure(input: {
  workspaceId: string;
  threadId: string;
  clientProfileId: string;
  safeError: string;
  currentStep?: string;
}) {
  const flow = await getGuidedFlowByThread(input.workspaceId, input.threadId);
  if (!flow || flow.path === "unclassified") {
    return null;
  }

  return patchGuidedFlow(
    input.workspaceId,
    input.threadId,
    input.clientProfileId,
    {
      status: "blocked",
      currentStep: input.currentStep ?? flow.currentStep,
      slots: {
        ...((flow.slots ?? {}) as Record<string, unknown>),
        lastActionError: input.safeError,
        resumeHint: "Revise os dados e tente confirmar a ação novamente.",
      },
    }
  );
}

export async function clearGuidedFlowActionBlock(input: {
  workspaceId: string;
  threadId: string;
  clientProfileId: string;
}) {
  const flow = await getGuidedFlowByThread(input.workspaceId, input.threadId);
  if (!flow || flow.status !== "blocked") {
    return flow;
  }

  const slots = { ...((flow.slots ?? {}) as Record<string, unknown>) };
  delete slots.lastActionError;
  delete slots.resumeHint;

  return patchGuidedFlow(
    input.workspaceId,
    input.threadId,
    input.clientProfileId,
    {
      status: "active",
      slots,
    }
  );
}
