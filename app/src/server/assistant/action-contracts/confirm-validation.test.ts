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

import {
  AssistantActionValidationError,
  InvalidActionTransitionError,
  getAssistantActionById,
} from "@/server/repositories/assistant-action";
import { getAssistantMessageById } from "@/server/repositories/assistant-message";
import { revalidateOnConfirm } from "./validate";

const mockGetAction = vi.mocked(getAssistantActionById);
const mockGetMessage = vi.mocked(getAssistantMessageById);

const WORKSPACE_ID = "ws-1";
const ACTION_ID = "action-1";
const MESSAGE_ID = "msg-1";
const BASE_CREATIVE_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

const pendingAction = {
  id: ACTION_ID,
  workspaceId: WORKSPACE_ID,
  messageId: MESSAGE_ID,
  status: "pending" as const,
  inputSnapshot: { baseCreativeId: BASE_CREATIVE_ID },
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
});
