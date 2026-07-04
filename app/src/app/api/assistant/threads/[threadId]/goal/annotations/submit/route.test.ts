import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));

vi.mock("@/server/repositories/assistant-goal", () => ({
  getGoalRunScoped: vi.fn(),
  submitAnnotationBatch: vi.fn(),
}));

vi.mock("@/server/assistant/tools/stubs/propose-action", () => ({
  handleProposeAction: vi.fn(),
}));

import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { getGoalRunScoped, submitAnnotationBatch } from "@/server/repositories/assistant-goal";

const mockRequireAccess = vi.mocked(requireWorkspaceAccess);
const mockGetThread = vi.mocked(getAssistantThreadById);
const mockGetGoal = vi.mocked(getGoalRunScoped);
const mockSubmit = vi.mocked(submitAnnotationBatch);

const workspace = { id: "ws-1" };
const user = { id: "user-1", email: "owner@adscale.com" };
const threadId = "00000000-0000-4000-8000-0000000000t1";
const params = Promise.resolve({ threadId });
const goalRunId = "00000000-0000-4000-8000-000000000001";
const sourceVersionId = "00000000-0000-4000-8000-000000000021";

function req(body: unknown): Request {
  return new Request(
    `http://localhost/api/assistant/threads/${threadId}/goal/annotations/submit`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("POST .../annotations/submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAccess.mockResolvedValue({ user, workspace } as never);
    mockGetThread.mockResolvedValue({
      id: threadId,
      workspaceId: "ws-1",
      clientProfileId: "client-1",
    } as never);
    mockGetGoal.mockResolvedValue({ id: goalRunId, campaignId: "c1", revision: 4, stage: "reviewing_base" } as never);
    mockSubmit.mockResolvedValue([{ id: "ann-1", status: "submitted" }] as never);
  });

  it("submits every draft annotation for the source version as one batch", async () => {
    const response = await POST(req({
      goalRunId,
      sourceVersionId,
      actionRecordId: "00000000-0000-4000-8000-0000000000a1",
    }), { params });

    expect(response.status).toBe(200);
    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        goalRunId,
        sourceVersionId,
        actionRecordId: "00000000-0000-4000-8000-0000000000a1",
      })
    );
  });

  it("returns the count of frozen annotations", async () => {
    mockSubmit.mockResolvedValue([
      { id: "ann-1", status: "submitted" },
      { id: "ann-2", status: "submitted" },
    ] as never);

    const response = await POST(req({
      goalRunId,
      sourceVersionId,
      actionRecordId: "00000000-0000-4000-8000-0000000000a1",
    }), { params });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.submittedCount).toBe(2);
  });
});
