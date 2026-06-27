import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PUT } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({ workspace: { id: "ws-1" } })
  ),
}));

vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));

vi.mock("@/server/assistant/plan-iteration/draft", () => ({
  getPlanFeedbackDraft: vi.fn(),
  savePlanFeedbackDraft: vi.fn(),
  PlanFeedbackDraftValidationError: class PlanFeedbackDraftValidationError extends Error {
    name = "PlanFeedbackDraftValidationError";
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import {
  getPlanFeedbackDraft,
  savePlanFeedbackDraft,
} from "@/server/assistant/plan-iteration/draft";

const mockGetThread = vi.mocked(getAssistantThreadById);
const mockGetDraft = vi.mocked(getPlanFeedbackDraft);
const mockSaveDraft = vi.mocked(savePlanFeedbackDraft);

const campaignThread = {
  id: "thread-1",
  clientProfileId: "profile-1",
  campaignId: "campaign-1",
};

describe("/api/assistant/threads/[threadId]/plan-revisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetThread.mockResolvedValue(
      campaignThread as Awaited<ReturnType<typeof getAssistantThreadById>>
    );
  });

  it("GET returns draft text", async () => {
    mockGetDraft.mockResolvedValue({ draftText: "unsent feedback" } as never);

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ threadId: "thread-1" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ draftText: "unsent feedback" });
  });

  it("PUT saves draft text", async () => {
    mockSaveDraft.mockResolvedValue({ draftText: "new draft" } as never);

    const response = await PUT(
      new Request("http://localhost/api", {
        method: "PUT",
        body: JSON.stringify({ draftText: "new draft" }),
      }),
      { params: Promise.resolve({ threadId: "thread-1" }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ draftText: "new draft" });
    expect(mockSaveDraft).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        campaignId: "campaign-1",
        threadId: "thread-1",
      },
      "new draft"
    );
  });

  it("returns 404 when thread has no campaign", async () => {
    mockGetThread.mockResolvedValue({
      id: "thread-1",
      clientProfileId: "profile-1",
      campaignId: null,
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ threadId: "thread-1" }),
    });

    expect(response.status).toBe(404);
  });
});
