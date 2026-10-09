import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/components/assistant/conversation/ConversationScreen", () => ({
  default: function ConversationScreenStub() { return null; },
}));
const mockWorkspaceAccess = vi.fn();
const mockGetThread = vi.fn();
const mockFindOwned = vi.fn();
vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: () => mockWorkspaceAccess(),
}));
vi.mock("@/server/repositories/assistant-thread", () => ({
  getAssistantThreadById: (workspaceId: string, threadId: string) => mockGetThread(workspaceId, threadId),
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/equipe/data/postgres", () => ({ createPostgresEquipeUnitOfWork: () => ({ repos: "equipe-repos" }) }));
vi.mock("@/server/equipe/module/threads", () => ({
  findEquipeThreadByAssistantThread: (...args: unknown[]) => mockFindOwned(...args),
}));

const mockFindFreePlan = vi.fn();
vi.mock("@/server/equipe/module/free-plan", () => ({
  findFreePlanAccount: (workspaceId: string) => mockFindFreePlan(workspaceId),
}));

import AssistantPage from "./page";

const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const missingThreads: (string | string[] | undefined)[] = [undefined, "   ", ["thread-1", "thread-2"]];

describe("AssistantPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkspaceAccess.mockResolvedValue({
      user: { id: "user-1", email: "user@example.test" }, workspace: { id: "workspace-1" },
    });
    mockGetThread.mockResolvedValue({ id: THREAD_ID, clientProfileId: "profile-1" });
    mockFindOwned.mockResolvedValue({ account: { id: "account-1" }, thread: { assistantThreadId: THREAD_ID } });
    mockFindFreePlan.mockResolvedValue(null);
  });

  it.each(missingThreads)("redirects an absent/invalid thread %j home, without querying a thread", async (threadId) => {
    await expect(
      AssistantPage({ searchParams: Promise.resolve({ threadId }) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/");
    expect(mockGetThread).not.toHaveBeenCalled();
  });

  it("opens a conversation that an account owns", async () => {
    const element = await AssistantPage({ searchParams: Promise.resolve({ threadId: THREAD_ID }) });
    expect(redirect).not.toHaveBeenCalled();
    expect(element.type.name).toBe("ConversationScreenStub");
    expect(element.props).toEqual({ threadId: THREAD_ID });
    expect(mockGetThread).toHaveBeenCalledWith("workspace-1", THREAD_ID);
    // The thread has to belong to the account of its brand: the same lookup the chat uses to send it to the Strategist.
    expect(mockFindOwned).toHaveBeenCalledExactlyOnceWith("equipe-repos", "workspace-1", "profile-1", THREAD_ID);
  });

  it("redirects a conversation not visible in the active workspace using only a scoped lookup", async () => {
    mockGetThread.mockResolvedValue(null);
    await expect(AssistantPage({ searchParams: Promise.resolve({ threadId: THREAD_ID }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(mockGetThread).toHaveBeenCalledExactlyOnceWith("workspace-1", THREAD_ID);
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("redirects a thread of the workspace that no account owns: it never opens in the classic assistant", async () => {
    mockFindOwned.mockResolvedValue(null);
    await expect(AssistantPage({ searchParams: Promise.resolve({ threadId: THREAD_ID }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(mockGetThread).toHaveBeenCalledExactlyOnceWith("workspace-1", THREAD_ID);
    expect(mockFindOwned).toHaveBeenCalledExactlyOnceWith("equipe-repos", "workspace-1", "profile-1", THREAD_ID);
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("does not look for an owner when the thread is not in the workspace", async () => {
    mockGetThread.mockResolvedValue(null);
    await expect(AssistantPage({ searchParams: Promise.resolve({ threadId: THREAD_ID }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(mockFindOwned).not.toHaveBeenCalled();
  });

  it("redirects a malformed ID without querying PostgreSQL", async () => {
    await expect(AssistantPage({ searchParams: Promise.resolve({ threadId: "not-a-uuid" }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(mockGetThread).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("lets the access error through without a session/workspace, and looks nothing up", async () => {
    mockWorkspaceAccess.mockRejectedValue(new Error("Unauthorized"));
    await expect(AssistantPage({ searchParams: Promise.resolve({ threadId: THREAD_ID }) })).rejects.toThrow("Unauthorized");
    expect(redirect).not.toHaveBeenCalled();
    expect(mockGetThread).not.toHaveBeenCalled();
  });

  describe("on the free plan (pinned to its account's brand)", () => {
    it("redirects a conversation of another account home: it cannot open under the pinned brand", async () => {
      mockFindFreePlan.mockResolvedValue({ accountId: "acc-a" });
      mockFindOwned.mockResolvedValue({ account: { id: "acc-b" }, thread: { assistantThreadId: THREAD_ID } });
      await expect(AssistantPage({ searchParams: Promise.resolve({ threadId: THREAD_ID }) })).rejects.toThrow("NEXT_REDIRECT");
      expect(mockFindFreePlan).toHaveBeenCalledExactlyOnceWith("workspace-1");
      expect(redirect).toHaveBeenCalledExactlyOnceWith("/");
    });

    it("opens a conversation of the pinned account", async () => {
      mockFindFreePlan.mockResolvedValue({ accountId: "acc-a" });
      mockFindOwned.mockResolvedValue({ account: { id: "acc-a" }, thread: { assistantThreadId: THREAD_ID } });
      const element = await AssistantPage({ searchParams: Promise.resolve({ threadId: THREAD_ID }) });
      expect(redirect).not.toHaveBeenCalled();
      expect(element.props).toEqual({ threadId: THREAD_ID });
    });

    it("a closed free account pins as well: another account's conversation goes home", async () => {
      mockFindFreePlan.mockResolvedValue({ accountId: null, closedAccountId: "acc-a" });
      mockFindOwned.mockResolvedValue({ account: { id: "acc-b" }, thread: { assistantThreadId: THREAD_ID } });
      await expect(AssistantPage({ searchParams: Promise.resolve({ threadId: THREAD_ID }) })).rejects.toThrow("NEXT_REDIRECT");
      expect(redirect).toHaveBeenCalledExactlyOnceWith("/");
    });

    it("a sign-up with no account yet (accountId null) pins nothing here", async () => {
      mockFindFreePlan.mockResolvedValue({ accountId: null });
      const element = await AssistantPage({ searchParams: Promise.resolve({ threadId: THREAD_ID }) });
      expect(redirect).not.toHaveBeenCalled();
      expect(element.props).toEqual({ threadId: THREAD_ID });
    });
  });

  it("a paying workspace opens a conversation of any of its accounts", async () => {
    mockFindFreePlan.mockResolvedValue(null);
    mockFindOwned.mockResolvedValue({ account: { id: "acc-b" }, thread: { assistantThreadId: THREAD_ID } });
    await AssistantPage({ searchParams: Promise.resolve({ threadId: THREAD_ID }) });
    expect(redirect).not.toHaveBeenCalled();
  });
});
