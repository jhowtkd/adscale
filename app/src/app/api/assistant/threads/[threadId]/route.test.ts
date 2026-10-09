import { describe, it, expect, vi, beforeEach } from "vitest";
import { DELETE, GET } from "./route";

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
  deleteUnusedAssistantThread: vi.fn(),
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

import { deleteUnusedAssistantThread, getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
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

describe("DELETE /api/assistant/threads/[threadId]", () => {
  const THREAD = "11111111-1111-4111-8111-111111111111";
  const del = (threadId: string) => DELETE(new Request(`http://localhost/api/assistant/threads/${threadId}`, { method: "DELETE" }), {
    params: Promise.resolve({ threadId }),
  });
  const mockDelete = vi.mocked(deleteUnusedAssistantThread);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("takes back an unused thread of the active workspace", async () => {
    mockDelete.mockResolvedValue("deleted");
    const res = await del(THREAD);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    expect(mockDelete).toHaveBeenCalledExactlyOnceWith("workspace-1", THREAD);
  });

  it("answers 404 for a thread that is not in the workspace and for a malformed id, which is never queried", async () => {
    mockDelete.mockResolvedValue("not_found");
    expect((await del(THREAD)).status).toBe(404);
    mockDelete.mockClear();
    expect((await del("t1")).status).toBe(404);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("answers 409 for a thread that was used or that an account owns, and says so by code", async () => {
    mockDelete.mockResolvedValue("in_use");
    const res = await del(THREAD);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "threadInUse" });
  });

  it("deletes nothing without a workspace session", async () => {
    vi.mocked(requireWorkspaceAccess).mockRejectedValueOnce(new Error("Unauthorized"));
    const res = await del(THREAD);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
