import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emitGuidedFlowActionConfirmed,
  emitGuidedFlowActionFailed,
  emitGuidedFlowActionProposed,
  emitGuidedFlowLifecycleFromPatch,
} from "./guided-flow-telemetry-lifecycle";

vi.mock("./guided-flow-telemetry", () => ({
  emitGuidedFlowTelemetry: vi.fn(),
}));

import { emitGuidedFlowTelemetry } from "./guided-flow-telemetry";

const mockEmit = vi.mocked(emitGuidedFlowTelemetry);

const baseFlow = {
  id: "flow-1",
  workspaceId: "ws-1",
  clientProfileId: "profile-1",
  threadId: "thread-1",
  path: "from_zero",
  status: "active",
  currentStep: "collect_brief",
  slots: {},
  missingFields: [],
  assetIds: [],
  referenceIds: [],
  campaignId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("guided-flow telemetry lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits start and first step view on create", () => {
    emitGuidedFlowLifecycleFromPatch({
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      threadId: "thread-1",
      previous: null,
      next: baseFlow,
    });

    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "guided_flow_started" })
    );
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "guided_step_viewed" })
    );
  });

  it("emits action_failure blocker when flow blocked after action error", () => {
    emitGuidedFlowLifecycleFromPatch({
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      threadId: "thread-1",
      previous: baseFlow,
      next: {
        ...baseFlow,
        status: "blocked",
        slots: { lastActionError: "provider timeout" },
      },
    });

    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "guided_action_blocked",
        blockerCategory: "action_failure",
      })
    );
  });

  it("emits abandoned lifecycle event", () => {
    emitGuidedFlowLifecycleFromPatch({
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      threadId: "thread-1",
      previous: baseFlow,
      next: { ...baseFlow, status: "abandoned" },
    });

    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "guided_flow_abandoned" })
    );
  });

  it("emits action lifecycle events with action record id", () => {
    emitGuidedFlowActionProposed({
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      threadId: "thread-1",
      guidedFlowId: "flow-1",
      path: "existing_creative",
      step: "confirm_improvement",
      actionRecordId: "action-1",
      actionType: "quick_restyle",
    });
    emitGuidedFlowActionConfirmed({
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      threadId: "thread-1",
      guidedFlowId: "flow-1",
      path: "existing_creative",
      step: "confirm_improvement",
      actionRecordId: "action-1",
      actionType: "quick_restyle",
    });
    emitGuidedFlowActionFailed({
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      threadId: "thread-1",
      guidedFlowId: "flow-1",
      path: "existing_creative",
      step: "confirm_improvement",
      actionRecordId: "action-1",
      actionType: "quick_restyle",
    });

    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "guided_action_proposed" })
    );
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "guided_action_confirmed" })
    );
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "guided_action_failed" })
    );
  });
});
