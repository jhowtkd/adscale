import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));

vi.mock("@/server/repositories/assistant-goal", () => ({
  getGoalRunScoped: vi.fn(),
  updateGoalRun: vi.fn(),
  AssistantGoalConflictError: class AssistantGoalConflictError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AssistantGoalConflictError";
    }
  },
}));

vi.mock("@/server/repositories/assistant-action", () => ({
  getAssistantActionById: vi.fn(),
  cancelAssistantAction: vi.fn(),
}));

vi.mock("@/server/assistant/goal/analytics", () => ({
  emitGoalEvent: vi.fn(),
}));

import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import {
  AssistantGoalConflictError,
  getGoalRunScoped,
  updateGoalRun,
} from "@/server/repositories/assistant-goal";
import { getAssistantActionById, cancelAssistantAction } from "@/server/repositories/assistant-action";

const mockRequireAccess = vi.mocked(requireWorkspaceAccess);
const mockGetThread = vi.mocked(getAssistantThreadById);
const mockGetGoal = vi.mocked(getGoalRunScoped);
const mockUpdateGoal = vi.mocked(updateGoalRun);
const mockGetAction = vi.mocked(getAssistantActionById);
const mockCancel = vi.mocked(cancelAssistantAction);

const workspace = { id: "ws-1" };
const user = { id: "user-1", email: "owner@adscale.com" };
const threadId = "00000000-0000-4000-8000-0000000000t1";
const goalRunId = "00000000-0000-4000-8000-0000000000g1";
const params = Promise.resolve({ threadId });

const baseGoal = {
  id: goalRunId,
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  threadId,
  revision: 2,
  stage: "generating_variants",
  campaignId: "campaign-1",
  resumeStage: null,
};

function jsonRequest(body: unknown): Request {
  return new Request(`http://localhost/api/assistant/threads/${threadId}/goal`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function call(body: unknown) {
  return POST(jsonRequest(body), { params });
}

describe("POST /api/assistant/threads/[threadId]/goal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAccess.mockResolvedValue({ user, workspace } as never);
    mockGetThread.mockResolvedValue({
      id: threadId,
      workspaceId: "ws-1",
      clientProfileId: "client-1",
    } as never);
    mockGetGoal.mockResolvedValue(baseGoal as never);
    mockUpdateGoal.mockResolvedValue({ ...baseGoal, stage: "stopped", revision: 3 } as never);
    mockCancel.mockResolvedValue({ id: "action-1" } as never);
  });

  it("cancels a pending paid action before dispatch on stop", async () => {
    mockGetAction.mockResolvedValue({ id: "action-1", status: "pending", threadId } as never);

    const response = await call({
      type: "stop",
      expectedRevision: 2,
      pendingActionId: "00000000-0000-4000-8000-0000000000a1",
    });

    expect(response.status).toBe(200);
    expect(mockCancel).toHaveBeenCalledWith(
      "ws-1",
      "00000000-0000-4000-8000-0000000000a1"
    );
    expect(mockUpdateGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        goalRunId,
        expectedRevision: 2,
        patch: expect.objectContaining({
          stage: "stopped",
          resumeStage: "generating_variants",
        }),
      })
    );
  });

  it("leaves dispatched running jobs charged and running on stop", async () => {
    mockGetAction.mockResolvedValue({ id: "action-1", status: "running" } as never);

    const response = await call({
      type: "stop",
      expectedRevision: 2,
      pendingActionId: "00000000-0000-4000-8000-0000000000a1",
    });

    expect(response.status).toBe(200);
    expect(mockCancel).not.toHaveBeenCalled();
    expect(mockUpdateGoal).toHaveBeenCalled();
  });

  it("resume returns to the stage derived from artifacts", async () => {
    mockGetGoal.mockResolvedValue({
      ...baseGoal,
      stage: "stopped",
      resumeStage: "generating_variants",
    } as never);
    mockUpdateGoal.mockResolvedValue({
      ...baseGoal,
      stage: "awaiting_generation",
      revision: 3,
    } as never);

    const response = await call({ type: "resume", expectedRevision: 2 });

    expect(response.status).toBe(200);
    expect(mockUpdateGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: expect.objectContaining({
          stage: "awaiting_generation",
          resumeStage: null,
          stoppedAt: null,
        }),
      })
    );
  });

  it("abandon records an optional reason without requiring it", async () => {
    const response = await call({ type: "abandon", expectedRevision: 2 });

    expect(response.status).toBe(200);
    expect(mockUpdateGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: expect.objectContaining({ stage: "stopped" }),
      })
    );
  });

  it("rejects a stale revision with conflict", async () => {
    mockUpdateGoal.mockImplementation(() => {
      throw new AssistantGoalConflictError("conflict");
    });

    const response = await call({ type: "stop", expectedRevision: 99 });

    expect(response.status).toBe(409);
  });

  it("rejects a cross-thread goal", async () => {
    mockGetGoal.mockResolvedValue(null as never);

    const response = await call({ type: "stop", expectedRevision: 2 });

    expect(response.status).toBe(404);
  });
});
