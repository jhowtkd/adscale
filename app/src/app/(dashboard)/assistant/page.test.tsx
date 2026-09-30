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
const mockGetSession = vi.fn();
const mockGetWorkspace = vi.fn();
const mockEntitlement = vi.fn();
const mockIsEquipeEnabledForWorkspace = vi.fn<(workspaceId: string) => boolean>();
vi.mock("@/server/auth/session", () => ({ getSession: () => mockGetSession() }));
vi.mock("@/server/repositories/workspace", () => ({
  getWorkspaceForUser: (userId: string) => mockGetWorkspace(userId),
}));
vi.mock("@/server/auth/platform-owner", () => ({ isPlatformOwnerEmail: vi.fn(() => false) }));
vi.mock("@/server/repositories/entitlements", () => ({
  getActiveTesterEntitlementByWorkspace: () => mockEntitlement(),
}));
vi.mock("@/server/equipe/module/equipe-enabled", () => ({
  isEquipeEnabledForWorkspace: (workspaceId: string) => mockIsEquipeEnabledForWorkspace(workspaceId),
}));

import AssistantPage from "./page";

const missingThreads: (string | string[] | undefined)[] = [undefined, "   ", ["thread-1", "thread-2"]];

describe("AssistantPage gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { id: "user-1", email: "user@example.test" } });
    mockGetWorkspace.mockResolvedValue({ id: "workspace-1" });
    mockEntitlement.mockResolvedValue(null);
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
    expect(element.props).toMatchObject({ threadId: undefined, equipeEnabled: false });
  });

  it.each([false, true])("renders existing threads with the workspace gate %j", async (enabled) => {
    mockIsEquipeEnabledForWorkspace.mockReturnValue(enabled);
    const element = await AssistantPage({ searchParams: Promise.resolve({ threadId: "thread-1" }) });
    expect(redirect).not.toHaveBeenCalled();
    expect(element.props).toMatchObject({ threadId: "thread-1", equipeEnabled: enabled });
  });

  it("keeps the gate on if the optional tester eligibility lookup fails", async () => {
    mockIsEquipeEnabledForWorkspace.mockReturnValue(true);
    mockEntitlement.mockRejectedValue(new Error("tester lookup failed"));
    await expect(AssistantPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("does not redirect without a session/workspace", async () => {
    mockGetSession.mockResolvedValue(null);
    const element = await AssistantPage({ searchParams: Promise.resolve({}) });
    expect(mockGetWorkspace).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    expect(element.props).toMatchObject({ threadId: undefined, equipeEnabled: false });
  });
});
