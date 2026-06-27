import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/assistant-action", () => ({
  getAssistantActionById: vi.fn(),
  transitionAssistantAction: vi.fn(),
}));

vi.mock("@/server/repositories/assistant-message", () => ({
  getAssistantMessageById: vi.fn(),
}));

vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));

vi.mock("@/server/repositories/user", () => ({
  getUserLocale: vi.fn(() => Promise.resolve("pt-BR")),
}));

vi.mock("./handlers/quick-restyle", () => ({
  executeQuickRestyle: vi.fn(() =>
    Promise.resolve({
      mode: "async",
      jobRef: { kind: "derivation", id: "derivation-1" },
      resultSummary: "queued",
    })
  ),
}));

vi.mock("@/server/assistant/guided-paths/action-integration", () => ({
  transitionGuidedFlowAfterAction: vi.fn(() => Promise.resolve(null)),
}));

import {
  getAssistantActionById,
  transitionAssistantAction,
} from "@/server/repositories/assistant-action";
import { getAssistantMessageById } from "@/server/repositories/assistant-message";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { executeQuickRestyle } from "./handlers/quick-restyle";
import { executeConfirmedAssistantAction } from "./execute";
import "@/server/assistant/action-contracts/contracts";

const mockGetAction = vi.mocked(getAssistantActionById);
const mockTransition = vi.mocked(transitionAssistantAction);
const mockGetMessage = vi.mocked(getAssistantMessageById);
const mockGetThread = vi.mocked(getAssistantThreadById);
const mockExecuteRestyle = vi.mocked(executeQuickRestyle);

describe("executeConfirmedAssistantAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAction.mockResolvedValue({
      id: "action-1",
      workspaceId: "ws-1",
      threadId: "thread-1",
      messageId: "msg-1",
      status: "confirmed",
      inputSnapshot: { baseCreativeId: "asset-1" },
      jobRefs: [],
      safeError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof getAssistantActionById>>);

    mockGetMessage.mockResolvedValue({
      id: "msg-1",
      payload: {
        display: { actionType: "quick_restyle", label: "Restyle" },
      },
    } as Awaited<ReturnType<typeof getAssistantMessageById>>);

    mockGetThread.mockResolvedValue({
      id: "thread-1",
      clientProfileId: "client-1",
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);

    mockTransition.mockImplementation(async (_ws, _id, status) => ({
      id: "action-1",
      status,
    })) as typeof mockTransition;
  });

  it("runs quick_restyle handler and leaves action running for async jobs", async () => {
    await executeConfirmedAssistantAction("ws-1", "action-1", "user-1", "pt-BR");

    expect(mockTransition).toHaveBeenCalledWith("ws-1", "action-1", "running");
    expect(mockExecuteRestyle).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "quick_restyle",
        inputSnapshot: { baseCreativeId: "asset-1" },
      })
    );
    expect(mockTransition).toHaveBeenLastCalledWith(
      "ws-1",
      "action-1",
      "running",
      expect.objectContaining({
        jobRef: { kind: "derivation", id: "derivation-1" },
      })
    );
  });
});
