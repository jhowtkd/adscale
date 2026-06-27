import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/guided-flow", () => ({
  getGuidedFlowByThread: vi.fn(),
  applyGuidedFlowCommand: vi.fn(),
}));
vi.mock("@/server/repositories/guided-flow-transition", () => ({
  getGuidedFlowTransitionByCommand: vi.fn(),
}));

import { applyGuidedFlowCommand, getGuidedFlowByThread } from "@/server/repositories/guided-flow";
import { getGuidedFlowTransitionByCommand } from "@/server/repositories/guided-flow-transition";
import { transitionGuidedFlowAfterAction } from "./action-integration";

const getFlow = vi.mocked(getGuidedFlowByThread);
const applyCommand = vi.mocked(applyGuidedFlowCommand);
const getTransition = vi.mocked(getGuidedFlowTransitionByCommand);

const flow = {
  id: "flow-1", workspaceId: "ws-1", clientProfileId: "cp-1", threadId: "t-1",
  path: "existing_creative", status: "active", currentStep: "confirm_improvement",
  slots: {}, missingFields: [], assetIds: [], referenceIds: [], campaignId: null,
  revision: 4, schemaVersion: 2, recoverableError: null, createdAt: new Date(), updatedAt: new Date(),
} as Awaited<ReturnType<typeof getGuidedFlowByThread>>;

describe("transitionGuidedFlowAfterAction", () => {
  beforeEach(() => { vi.clearAllMocks(); getTransition.mockResolvedValue(null); });

  it("persists failure through revision CAS", async () => {
    getFlow.mockResolvedValue(flow);
    applyCommand.mockResolvedValue({ ...flow!, status: "blocked" });
    await transitionGuidedFlowAfterAction({ workspaceId: "ws-1", threadId: "t-1", clientProfileId: "cp-1", actionId: "a-1", result: "failed", safeError: "Falhou" });
    expect(applyCommand).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 4, commandId: "action:a-1:failed", patch: expect.objectContaining({ status: "blocked", revision: 5 }) }));
  });

  it("is idempotent when the action result was already applied", async () => {
    getFlow.mockResolvedValue(flow);
    getTransition.mockResolvedValue({ id: "transition-1" } as Awaited<ReturnType<typeof getGuidedFlowTransitionByCommand>>);
    await transitionGuidedFlowAfterAction({ workspaceId: "ws-1", threadId: "t-1", clientProfileId: "cp-1", actionId: "a-1", result: "completed" });
    expect(applyCommand).not.toHaveBeenCalled();
  });
});
