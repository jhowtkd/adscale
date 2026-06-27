import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: vi.fn(),
}));

vi.mock("@/server/repositories/assistant-message", () => ({
  listAssistantMessages: vi.fn(),
}));

vi.mock("@/server/repositories/guided-flow", () => ({
  getGuidedFlowByThread: vi.fn(),
}));

vi.mock("@/server/assistant/artifact-version/service", () => ({
  getThreadArtifactVersionState: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { listAssistantMessages } from "@/server/repositories/assistant-message";
import { getGuidedFlowByThread } from "@/server/repositories/guided-flow";
import { getThreadArtifactVersionState } from "@/server/assistant/artifact-version/service";

const mockGetThread = vi.mocked(getAssistantThreadById);
const mockListMessages = vi.mocked(listAssistantMessages);
const mockGetGuidedFlow = vi.mocked(getGuidedFlowByThread);
const mockGetArtifactVersionState = vi.mocked(getThreadArtifactVersionState);

describe("GET /api/assistant/threads/[threadId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetArtifactVersionState.mockResolvedValue({ lineages: [] });
  });

  it("returns 404 when thread is not in workspace", async () => {
    mockGetThread.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/assistant/threads/t1"), {
      params: Promise.resolve({ threadId: "t1" }),
    });

    expect(res.status).toBe(404);
    expect(mockListMessages).not.toHaveBeenCalled();
  });

  it("returns thread and messages when scoped", async () => {
    const thread = { id: "t1", workspaceId: "workspace-1", name: "Main" };
    const messages = [{ id: "m1", sequence: 1 }];
    mockGetThread.mockResolvedValue(thread as Awaited<ReturnType<typeof getAssistantThreadById>>);
    mockListMessages.mockResolvedValue(
      messages as Awaited<ReturnType<typeof listAssistantMessages>>
    );
    mockGetGuidedFlow.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/assistant/threads/t1"), {
      params: Promise.resolve({ threadId: "t1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.thread).toEqual(thread);
    expect(body.messages).toEqual(messages);
    expect(body.artifactVersionState).toEqual({ lineages: [] });
    expect(body.guidedFlow).toBeUndefined();
  });

  it("includes guidedFlow when present", async () => {
    const thread = { id: "t1", workspaceId: "workspace-1", name: "Main" };
    const messages = [{ id: "m1", sequence: 1 }];
    const guidedFlow = {
      id: "flow-1", workspaceId: "workspace-1", clientProfileId: "profile-1", threadId: "t1",
      path: "from_zero", status: "active", currentStep: "collect_brief", slots: {},
      missingFields: [], assetIds: [], referenceIds: [], campaignId: null, revision: 0,
      schemaVersion: 2, recoverableError: null, createdAt: new Date(), updatedAt: new Date(),
    };
    mockGetThread.mockResolvedValue(thread as Awaited<ReturnType<typeof getAssistantThreadById>>);
    mockListMessages.mockResolvedValue(
      messages as Awaited<ReturnType<typeof listAssistantMessages>>
    );
    mockGetGuidedFlow.mockResolvedValue(
      guidedFlow as Awaited<ReturnType<typeof getGuidedFlowByThread>>
    );

    const res = await GET(new Request("http://localhost/api/assistant/threads/t1"), {
      params: Promise.resolve({ threadId: "t1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.guidedFlow).toEqual(expect.objectContaining({ id: "flow-1", currentStep: "collect_brief", revision: 0 }));
  });
});
