import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/workspace", () => ({
  requireRole: vi.fn(),
}));

vi.mock("@/server/repositories/assistant-action", () => ({
  getAssistantActionById: vi.fn(),
  AssistantActionValidationError: class AssistantActionValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AssistantActionValidationError";
    }
  },
  InvalidActionTransitionError: class InvalidActionTransitionError extends Error {
    constructor(from: string, to: string) {
      super(`Invalid action transition: ${from} -> ${to}`);
      this.name = "InvalidActionTransitionError";
    }
  },
}));

vi.mock("@/server/repositories/assistant-message", () => ({
  getAssistantMessageById: vi.fn(),
}));

vi.mock("@/server/repositories/guided-flow", () => ({
  getGuidedFlowByThread: vi.fn(),
}));
vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));
vi.mock("@/server/repositories/assistant-goal", () => ({
  getGoalRunScoped: vi.fn(),
}));
vi.mock("@/server/billing/paywall", () => ({
  checkSpend: vi.fn(() => Promise.resolve({ allowed: true, amount: 5, balance: 50 })),
}));

import {
  AssistantActionValidationError,
  InvalidActionTransitionError,
  getAssistantActionById,
} from "@/server/repositories/assistant-action";
import { getAssistantMessageById } from "@/server/repositories/assistant-message";
import { getGuidedFlowByThread } from "@/server/repositories/guided-flow";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { getGoalRunScoped } from "@/server/repositories/assistant-goal";
import { checkSpend } from "@/server/billing/paywall";
import { revalidateOnConfirm } from "./validate";

const mockGetAction = vi.mocked(getAssistantActionById);
const mockGetMessage = vi.mocked(getAssistantMessageById);
const mockGetFlow = vi.mocked(getGuidedFlowByThread);
const mockCanSpend = vi.mocked(checkSpend);
const mockGetThread = vi.mocked(getAssistantThreadById);
const mockGetGoal = vi.mocked(getGoalRunScoped);

const WORKSPACE_ID = "ws-1";
const ACTION_ID = "action-1";
const MESSAGE_ID = "msg-1";
const BASE_CREATIVE_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

const pendingAction = {
  id: ACTION_ID,
  workspaceId: WORKSPACE_ID,
  messageId: MESSAGE_ID,
  status: "pending" as const,
  threadId: "thread-1",
  inputSnapshot: { baseCreativeId: BASE_CREATIVE_ID },
  sourceFlowRevision: null,
  sourceSnapshotDigest: null,
};

const actionCardMessage = {
  id: MESSAGE_ID,
  workspaceId: WORKSPACE_ID,
  type: "action_card" as const,
  payload: {
    actionRecordId: ACTION_ID,
    status: "pending",
    display: { actionType: "quick_restyle", label: "Restyle rápido" },
  },
};

describe("revalidateOnConfirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanSpend.mockResolvedValue({ allowed: true, amount: 5, balance: 50 });
    mockGetThread.mockResolvedValue({
      id: "thread-1",
      workspaceId: WORKSPACE_ID,
      clientProfileId: "profile-1",
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);
  });

  it("resolves goal scope from the action thread instead of requiring clientProfileId in a strict snapshot", async () => {
    const goalRunId = "00000000-0000-4000-8000-000000000001";
    const planVersionId = "00000000-0000-4000-8000-000000000002";
    mockGetAction.mockResolvedValue({
      ...pendingAction,
      inputSnapshot: { goalRunId, goalRevision: 3, planVersionId, format: "1:1" },
    });
    mockGetMessage.mockResolvedValue({
      ...actionCardMessage,
      payload: {
        ...actionCardMessage.payload,
        display: { actionType: "generate_creative_triplet" },
      },
    } as Awaited<ReturnType<typeof getAssistantMessageById>>);
    mockGetGoal.mockResolvedValue({
      id: goalRunId,
      revision: 3,
    } as Awaited<ReturnType<typeof getGoalRunScoped>>);

    await expect(
      revalidateOnConfirm(WORKSPACE_ID, ACTION_ID, "user-1")
    ).resolves.toBeUndefined();
    expect(mockGetGoal).toHaveBeenCalledWith(
      WORKSPACE_ID,
      "profile-1",
      "thread-1"
    );
  });

  it("throws action_not_found when action is missing", async () => {
    mockGetAction.mockResolvedValue(null);

    await expect(revalidateOnConfirm(WORKSPACE_ID, ACTION_ID)).rejects.toThrow(
      new AssistantActionValidationError("action_not_found")
    );
  });

  it("throws InvalidActionTransitionError when status is not pending", async () => {
    mockGetAction.mockResolvedValue({
      ...pendingAction,
      status: "confirmed",
    });

    await expect(revalidateOnConfirm(WORKSPACE_ID, ACTION_ID)).rejects.toBeInstanceOf(
      InvalidActionTransitionError
    );
  });

  it("throws unknown_action_type when display.actionType is missing", async () => {
    mockGetAction.mockResolvedValue(pendingAction);
    mockGetMessage.mockResolvedValue({
      ...actionCardMessage,
      payload: { actionRecordId: ACTION_ID, status: "pending", display: {} },
    } as Awaited<ReturnType<typeof getAssistantMessageById>>);

    await expect(revalidateOnConfirm(WORKSPACE_ID, ACTION_ID)).rejects.toThrow(
      new AssistantActionValidationError("unknown_action_type")
    );
  });

  it("throws invalid_action_inputs when snapshot fails contract schema", async () => {
    mockGetAction.mockResolvedValue({
      ...pendingAction,
      inputSnapshot: {},
    });
    mockGetMessage.mockResolvedValue(
      actionCardMessage as Awaited<ReturnType<typeof getAssistantMessageById>>
    );

    await expect(revalidateOnConfirm(WORKSPACE_ID, ACTION_ID)).rejects.toThrow(
      new AssistantActionValidationError("invalid_action_inputs")
    );
  });

  it("passes for valid pending quick_restyle without mutating snapshot", async () => {
    const snapshot = { baseCreativeId: BASE_CREATIVE_ID };
    mockGetAction.mockResolvedValue({
      ...pendingAction,
      inputSnapshot: snapshot,
    });
    mockGetMessage.mockResolvedValue(
      actionCardMessage as Awaited<ReturnType<typeof getAssistantMessageById>>
    );

    await expect(
      revalidateOnConfirm(WORKSPACE_ID, ACTION_ID)
    ).resolves.toBeUndefined();

    expect(snapshot).toEqual({ baseCreativeId: BASE_CREATIVE_ID });
    expect(mockGetAction).toHaveBeenCalledWith(WORKSPACE_ID, ACTION_ID);
    expect(mockGetMessage).toHaveBeenCalledWith(WORKSPACE_ID, MESSAGE_ID);
  });

  it("rejects confirmation when credits are insufficient", async () => {
    mockGetAction.mockResolvedValue(pendingAction);
    mockGetMessage.mockResolvedValue(actionCardMessage as Awaited<ReturnType<typeof getAssistantMessageById>>);
    mockCanSpend.mockResolvedValue({ allowed: false, amount: 5, balance: 0, reason: "insufficient_credits" });
    await expect(revalidateOnConfirm(WORKSPACE_ID, ACTION_ID, "user-1")).rejects.toThrow(
      new AssistantActionValidationError("insufficient_credits")
    );
  });

  it("rejects a guided action when the source revision is stale", async () => {
    const inputSnapshot = {
      productOffer: "Shoes - 20% off", audience: "Runners", objective: "Sales",
      cta: "Shop now", platformOrFormat: "Instagram 4:5", constraints: "Keep logo",
      baseCreativeId: BASE_CREATIVE_ID,
    };
    mockGetAction.mockResolvedValue({
      ...pendingAction,
      inputSnapshot,
      sourceFlowRevision: 4,
      sourceSnapshotDigest: "digest-from-revision-4",
    });
    mockGetMessage.mockResolvedValue({
      ...actionCardMessage,
      payload: { ...actionCardMessage.payload, display: { ...actionCardMessage.payload.display, actionType: "start_complete_campaign" } },
    } as Awaited<ReturnType<typeof getAssistantMessageById>>);
    mockGetFlow.mockResolvedValue({
      id: "flow-1", workspaceId: WORKSPACE_ID, clientProfileId: "profile-1", threadId: "thread-1",
      path: "existing_creative", status: "active", currentStep: "confirm_improvement",
      slots: { reviewApproved: true }, missingFields: [], assetIds: [BASE_CREATIVE_ID], referenceIds: [],
      campaignId: null, revision: 5, schemaVersion: 2, recoverableError: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    await expect(revalidateOnConfirm(WORKSPACE_ID, ACTION_ID, "user-1")).rejects.toThrow(
      new AssistantActionValidationError("stale_guided_action")
    );
  });
});
