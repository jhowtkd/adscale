import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({ workspace: { id: "ws-1" } })
  ),
}));

vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));

vi.mock("@/server/assistant/plan-iteration/proposal", () => ({
  cancelPlanRevision: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { cancelPlanRevision } from "@/server/assistant/plan-iteration/proposal";

const mockGetThread = vi.mocked(getAssistantThreadById);
const mockCancel = vi.mocked(cancelPlanRevision);

const campaignThread = {
  id: "thread-1",
  clientProfileId: "profile-1",
  campaignId: "campaign-1",
};

describe("POST /api/assistant/artifact-proposals/[proposalId]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetThread.mockResolvedValue(
      campaignThread as Awaited<ReturnType<typeof getAssistantThreadById>>
    );
    mockCancel.mockResolvedValue({
      id: "proposal-1",
      status: "canceled",
    } as Awaited<ReturnType<typeof cancelPlanRevision>>);
  });

  it("cancels a pending proposal for a campaign thread", async () => {
    const response = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ threadId: "thread-1" }),
      }),
      { params: Promise.resolve({ proposalId: "proposal-1" }) }
    );

    expect(response.status).toBe(200);
    expect(mockCancel).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        campaignId: "campaign-1",
        threadId: "thread-1",
      },
      "proposal-1"
    );
  });

  it("returns 400 when threadId is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ proposalId: "proposal-1" }) }
    );

    expect(response.status).toBe(400);
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it("returns 404 when thread is not campaign-linked", async () => {
    mockGetThread.mockResolvedValue({
      id: "thread-1",
      clientProfileId: "profile-1",
      campaignId: null,
    } as Awaited<ReturnType<typeof getAssistantThreadById>>);

    const response = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ threadId: "thread-1" }),
      }),
      { params: Promise.resolve({ proposalId: "proposal-1" }) }
    );

    expect(response.status).toBe(404);
    expect(mockCancel).not.toHaveBeenCalled();
  });
});
