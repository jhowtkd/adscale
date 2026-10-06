import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/components/assistant/AssistantMain", () => ({
  default: function AssistantMainStub() { return null; },
}));
vi.mock("@/components/assistant/conversation/ConversationScreen", () => ({
  default: function ConversationScreenStub() { return null; },
}));
const mockWorkspaceAccess = vi.fn();
const mockEntitlement = vi.fn();
const mockGetThread = vi.fn();
const mockFindOwned = vi.fn();
const mockIsEquipeEnabledForWorkspace = vi.fn<(workspaceId: string) => boolean>();
vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: () => mockWorkspaceAccess(),
}));
vi.mock("@/server/auth/platform-owner", () => ({ isPlatformOwnerEmail: vi.fn(() => false) }));
vi.mock("@/server/repositories/entitlements", () => ({
  getActiveTesterEntitlementByWorkspace: () => mockEntitlement(),
}));
vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: (workspaceId: string, threadId: string) => mockGetThread(workspaceId, threadId),
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/equipe/data/postgres", () => ({ createPostgresEquipeUnitOfWork: () => ({ repos: "equipe-repos" }) }));
vi.mock("@/server/equipe/module/threads", () => ({
  findEquipeThreadByAssistantThread: (...args: unknown[]) => mockFindOwned(...args),
}));
vi.mock("@/server/equipe/module/free-plan", () => ({
  usesEquipeProduct: async (workspaceId: string) => mockIsEquipeEnabledForWorkspace(workspaceId),
}));

import AssistantPage from "./page";

const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const missingThreads: (string | string[] | undefined)[] = [undefined, "   ", ["thread-1", "thread-2"]];

describe("AssistantPage gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkspaceAccess.mockResolvedValue({
      user: { id: "user-1", email: "user@example.test" }, workspace: { id: "workspace-1" },
    });
    mockEntitlement.mockResolvedValue(null);
    mockGetThread.mockResolvedValue({ id: THREAD_ID, clientProfileId: "profile-1" });
    mockFindOwned.mockResolvedValue({ account: { id: "account-1" }, thread: { assistantThreadId: THREAD_ID } });
    mockIsEquipeEnabledForWorkspace.mockReturnValue(false);
  });

  it.each(missingThreads)("redirects an absent/invalid thread %j when the workspace gate is on", async (threadId) => {
    mockIsEquipeEnabledForWorkspace.mockReturnValue(true);
    await expect(
      AssistantPage({ searchParams: Promise.resolve({ threadId }) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/");
    expect(mockIsEquipeEnabledForWorkspace).toHaveBeenCalledWith("workspace-1");
  });

  it.each(missingThreads)("keeps the classic start composer for absent/invalid thread %j with the gate off", async (threadId) => {
    const element = await AssistantPage({ searchParams: Promise.resolve({ threadId }) });
    expect(redirect).not.toHaveBeenCalled();
    expect(element.type.name).toBe("AssistantMainStub");
    expect(element.props).toMatchObject({ threadId: undefined });
    expect(element.props).not.toHaveProperty("equipeEnabled");
  });

  it.each([false, true])("renders existing threads with the workspace gate %j", async (enabled) => {
    mockIsEquipeEnabledForWorkspace.mockReturnValue(enabled);
    const element = await AssistantPage({ searchParams: Promise.resolve({ threadId: THREAD_ID }) });
    expect(redirect).not.toHaveBeenCalled();
    expect(element.props).toMatchObject({ threadId: THREAD_ID });
    expect(element.props).not.toHaveProperty("equipeEnabled");
    if (enabled) {
      expect(element.type.name).toBe("ConversationScreenStub");
      expect(mockGetThread).toHaveBeenCalledWith("workspace-1", THREAD_ID);
      // The thread has to belong to the account of its brand: the same lookup the chat uses to send it to the Strategist.
      expect(mockFindOwned).toHaveBeenCalledExactlyOnceWith("equipe-repos", "workspace-1", "profile-1", THREAD_ID);
    } else {
      expect(element.type.name).toBe("AssistantMainStub");
      expect(mockGetThread).not.toHaveBeenCalled();
      expect(mockFindOwned).not.toHaveBeenCalled();
    }
  });

  it("keeps the gate on if the optional tester eligibility lookup fails", async () => {
    mockIsEquipeEnabledForWorkspace.mockReturnValue(true);
    mockEntitlement.mockRejectedValue(new Error("tester lookup failed"));
    await expect(AssistantPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("does not redirect without a session/workspace", async () => {
    mockWorkspaceAccess.mockRejectedValue(new Error("Unauthorized"));
    const element = await AssistantPage({ searchParams: Promise.resolve({}) });
    expect(redirect).not.toHaveBeenCalled();
    expect(element.props).toMatchObject({ threadId: undefined });
  });

  it.each([false, true])("uses the active workspace gate %j instead of another workspace's opposite gate", async (enabled) => {
    mockWorkspaceAccess.mockResolvedValue({
      user: { id: "user-1", email: "user@example.test" }, workspace: { id: "workspace-active" },
    });
    mockIsEquipeEnabledForWorkspace.mockImplementation((id) => id === "workspace-active" ? enabled : !enabled);
    const element = await AssistantPage({ searchParams: Promise.resolve({ threadId: THREAD_ID }) });
    expect(mockWorkspaceAccess).toHaveBeenCalledWith();
    expect(mockIsEquipeEnabledForWorkspace).toHaveBeenCalledWith("workspace-active");
    expect(element.type.name).toBe(enabled ? "ConversationScreenStub" : "AssistantMainStub");
    if (enabled) expect(mockGetThread).toHaveBeenCalledWith("workspace-active", THREAD_ID);
  });

  it("redirects a conversation not visible in the active workspace using only a scoped lookup", async () => {
    mockIsEquipeEnabledForWorkspace.mockReturnValue(true);
    mockGetThread.mockResolvedValue(null);
    await expect(AssistantPage({ searchParams: Promise.resolve({ threadId: THREAD_ID }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(mockGetThread).toHaveBeenCalledExactlyOnceWith("workspace-1", THREAD_ID);
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("redirects a thread of the workspace that no account owns: it never opens in the classic assistant", async () => {
    mockIsEquipeEnabledForWorkspace.mockReturnValue(true);
    mockFindOwned.mockResolvedValue(null);
    await expect(AssistantPage({ searchParams: Promise.resolve({ threadId: THREAD_ID }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(mockGetThread).toHaveBeenCalledExactlyOnceWith("workspace-1", THREAD_ID);
    expect(mockFindOwned).toHaveBeenCalledExactlyOnceWith("equipe-repos", "workspace-1", "profile-1", THREAD_ID);
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("does not look for an owner when the thread is not in the workspace", async () => {
    mockIsEquipeEnabledForWorkspace.mockReturnValue(true);
    mockGetThread.mockResolvedValue(null);
    await expect(AssistantPage({ searchParams: Promise.resolve({ threadId: THREAD_ID }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(mockFindOwned).not.toHaveBeenCalled();
  });

  it("redirects a malformed ID with the gate on without querying PostgreSQL", async () => {
    mockIsEquipeEnabledForWorkspace.mockReturnValue(true);
    await expect(AssistantPage({ searchParams: Promise.resolve({ threadId: "not-a-uuid" }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(mockGetThread).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it.each([THREAD_ID, "not-a-uuid"])("keeps the old gate-off behavior for an invalid conversation %s", async (threadId) => {
    mockGetThread.mockResolvedValue(null);
    const element = await AssistantPage({ searchParams: Promise.resolve({ threadId }) });
    expect(mockGetThread).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    expect(element.type.name).toBe("AssistantMainStub");
    expect(element.props).toMatchObject({ threadId });
  });
});
