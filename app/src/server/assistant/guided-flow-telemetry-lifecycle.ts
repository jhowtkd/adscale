import type { AssistantGuidedFlow } from "@/server/db/schema";
import { emitGuidedFlowTelemetry } from "@/server/assistant/guided-flow-telemetry";

export function emitGuidedFlowLifecycleFromPatch(input: {
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  previous: AssistantGuidedFlow | null;
  next: AssistantGuidedFlow;
}) {
  const scope = {
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    threadId: input.threadId,
    guidedFlowId: input.next.id,
    path: input.next.path,
    campaignId: input.next.campaignId,
  };

  if (!input.previous) {
    emitGuidedFlowTelemetry({
      ...scope,
      step: input.next.currentStep,
      eventKey: "guided_flow_started",
    });
    emitGuidedFlowTelemetry({
      ...scope,
      step: input.next.currentStep,
      eventKey: "guided_step_viewed",
    });
    return;
  }

  if (input.previous.currentStep !== input.next.currentStep) {
    emitGuidedFlowTelemetry({
      ...scope,
      step: input.next.currentStep,
      eventKey: "guided_step_viewed",
    });
  }

  if (input.previous.status !== "completed" && input.next.status === "completed") {
    emitGuidedFlowTelemetry({
      ...scope,
      step: input.next.currentStep,
      eventKey: "guided_flow_completed",
    });
  }

  if (input.previous.status !== "blocked" && input.next.status === "blocked") {
    emitGuidedFlowTelemetry({
      ...scope,
      step: input.next.currentStep,
      eventKey: "guided_action_blocked",
      blockerCategory: "unknown",
      metadata: { status: "blocked" },
    });
  }
}
