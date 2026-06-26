import type { AssistantGuidedFlow } from "@/server/db/schema";
import {
  emitGuidedFlowTelemetry,
  type GuidedFlowBlockerCategory,
} from "@/server/assistant/guided-flow-telemetry";

function readSlotString(
  slots: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const value = slots?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function resolveBlockedCategory(
  next: AssistantGuidedFlow
): GuidedFlowBlockerCategory {
  const slots = (next.slots ?? {}) as Record<string, unknown>;
  if (readSlotString(slots, "lastActionError")) {
    return "action_failure";
  }
  if ((next.missingFields ?? []).length > 0) {
    return "missing_brief_fields";
  }
  if ((next.referenceIds ?? []).length === 0 && next.currentStep === "select_references") {
    return "missing_references";
  }
  if ((next.assetIds ?? []).length === 0 && next.currentStep === "select_creative") {
    return "missing_asset";
  }
  return "unknown";
}

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

  if (input.previous.status !== "abandoned" && input.next.status === "abandoned") {
    emitGuidedFlowTelemetry({
      ...scope,
      step: input.next.currentStep,
      eventKey: "guided_flow_abandoned",
      metadata: { status: "abandoned" },
    });
  }

  if (input.previous.status !== "blocked" && input.next.status === "blocked") {
    const blockerCategory = resolveBlockedCategory(input.next);
    emitGuidedFlowTelemetry({
      ...scope,
      step: input.next.currentStep,
      eventKey: "guided_action_blocked",
      blockerCategory,
      metadata: {
        status: "blocked",
        reasonCode:
          blockerCategory === "action_failure"
            ? "action_execution_failed"
            : blockerCategory,
      },
    });
  }
}

export function emitGuidedFlowActionProposed(input: {
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  guidedFlowId: string;
  path: string;
  step: string;
  actionRecordId: string;
  campaignId?: string | null;
  actionType: string;
}) {
  emitGuidedFlowTelemetry({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    threadId: input.threadId,
    guidedFlowId: input.guidedFlowId,
    path: input.path,
    step: input.step,
    actionRecordId: input.actionRecordId,
    campaignId: input.campaignId ?? null,
    eventKey: "guided_action_proposed",
    metadata: { actionType: input.actionType, status: "pending" },
  });
}

export function emitGuidedFlowActionConfirmed(input: {
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  guidedFlowId: string;
  path: string;
  step: string;
  actionRecordId: string;
  campaignId?: string | null;
  actionType: string;
}) {
  emitGuidedFlowTelemetry({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    threadId: input.threadId,
    guidedFlowId: input.guidedFlowId,
    path: input.path,
    step: input.step,
    actionRecordId: input.actionRecordId,
    campaignId: input.campaignId ?? null,
    eventKey: "guided_action_confirmed",
    metadata: { actionType: input.actionType, status: "confirmed" },
  });
}

export function emitGuidedFlowActionFailed(input: {
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  guidedFlowId: string;
  path: string;
  step: string;
  actionRecordId: string;
  campaignId?: string | null;
  actionType: string;
  reasonCode?: string;
}) {
  emitGuidedFlowTelemetry({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    threadId: input.threadId,
    guidedFlowId: input.guidedFlowId,
    path: input.path,
    step: input.step,
    actionRecordId: input.actionRecordId,
    campaignId: input.campaignId ?? null,
    eventKey: "guided_action_failed",
    blockerCategory: "action_failure",
    metadata: {
      actionType: input.actionType,
      status: "failed",
      reasonCode: input.reasonCode ?? "action_execution_failed",
    },
  });
}
