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

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationsByCampaign: vi.fn(),
}));

vi.mock("@/server/assistant/goal/analytics", () => ({
  emitGoalEvent: vi.fn(),
}));

vi.mock("@/server/output-learning/output-decision-events", () => ({
  recordOutputDecision: vi.fn(),
}));

import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { getGoalRunScoped, updateGoalRun } from "@/server/repositories/assistant-goal";
import { getDerivationsByCampaign } from "@/server/repositories/derivation";

const mockRequireAccess = vi.mocked(requireWorkspaceAccess);
const mockGetThread = vi.mocked(getAssistantThreadById);
const mockGetGoal = vi.mocked(getGoalRunScoped);
const mockUpdateGoal = vi.mocked(updateGoalRun);
const mockGetDerivations = vi.mocked(getDerivationsByCampaign);

const workspace = { id: "ws-1" };
const user = { id: "user-1", email: "owner@adscale.com" };
const threadId = "00000000-0000-4000-8000-0000000000t1";
const goalRunId = "00000000-0000-4000-8000-000000000001";
const params = Promise.resolve({ threadId });

const baseGoal = {
  id: goalRunId,
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  threadId,
  revision: 4,
  stage: "choosing_base",
  campaignId: "campaign-1",
  selectedBaseVersionId: null,
};

function jsonRequest(body: unknown): Request {
  return new Request(
    `http://localhost/api/assistant/threads/${threadId}/goal/select-base`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

async function call(body: unknown) {
  return POST(jsonRequest(body), { params });
}

describe("POST /api/assistant/threads/[threadId]/goal/select-base", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAccess.mockResolvedValue({ user, workspace } as never);
    mockGetThread.mockResolvedValue({
      id: threadId,
      workspaceId: "ws-1",
      clientProfileId: "client-1",
    } as never);
    mockGetGoal.mockResolvedValue(baseGoal as never);
    mockUpdateGoal.mockResolvedValue({ ...baseGoal, stage: "reviewing_base", revision: 5 } as never);
    mockGetDerivations.mockResolvedValue([
      { id: "00000000-0000-4000-8000-000000000011", creativeLevel: "conservative", format: "1:1", status: "completed" },
    ] as never);
  });

  it("selects a version belonging to the current triplet", async () => {
    const response = await call({
      versionId: "00000000-0000-4000-8000-000000000011",
      expectedRevision: 4,
    });

    expect(response.status).toBe(200);
    expect(mockUpdateGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: expect.objectContaining({
          stage: "reviewing_base",
          selectedBaseVersionId: "00000000-0000-4000-8000-000000000011",
        }),
      })
    );
  });

  it("rejects a version outside the goal campaign", async () => {
    mockGetDerivations.mockResolvedValue([] as never);

    const response = await call({
      versionId: "00000000-0000-4000-8000-000000000099",
      expectedRevision: 4,
    });

    expect(response.status).toBe(400);
  });

  it("rejects a stale revision with conflict", async () => {
    const { AssistantGoalConflictError } = await import("@/server/repositories/assistant-goal");
    mockUpdateGoal.mockImplementation(() => {
      throw new AssistantGoalConflictError("conflict");
    });

    const response = await call({
      versionId: "00000000-0000-4000-8000-000000000011",
      expectedRevision: 99,
    });

    expect(response.status).toBe(409);
  });
});
