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
vi.mock("@/server/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/server/repositories/workspace", () => ({ getWorkspaceForUser: vi.fn() }));
vi.mock("@/server/auth/platform-owner", () => ({ isPlatformOwnerEmail: vi.fn(() => false) }));
vi.mock("@/server/repositories/entitlements", () => ({
  getActiveTesterEntitlementByWorkspace: vi.fn(),
}));
const mockIsEquipeEnabledForWorkspace = vi.fn(() => false);
vi.mock("@/server/equipe/module/equipe-enabled", () => ({
  isEquipeEnabledForWorkspace: () => mockIsEquipeEnabledForWorkspace(),
}));

import { getSession } from "@/server/auth/session";
import AssistantPage from "./page";

describe("AssistantPage without a thread", () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear();
    vi.mocked(getSession).mockReset();
    vi.mocked(getSession).mockResolvedValue(null);
    mockIsEquipeEnabledForWorkspace.mockReset();
    mockIsEquipeEnabledForWorkspace.mockReturnValue(false);
  });

  it("redirects to the home conversation when no threadId is present, regardless of the gate", async () => {
    await expect(
      AssistantPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("redirects on a blank threadId", async () => {
    await expect(
      AssistantPage({ searchParams: Promise.resolve({ threadId: "   " }) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("still redirects when the home conversation gate is on", async () => {
    mockIsEquipeEnabledForWorkspace.mockReturnValue(true);
    await expect(
      AssistantPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("redirects when threadId is repeated as an array in the URL", async () => {
    await expect(
      AssistantPage({ searchParams: Promise.resolve({ threadId: ["thread-1", "thread-2"] }) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("renders the assistant when a threadId is present", async () => {
    const element = await AssistantPage({ searchParams: Promise.resolve({ threadId: "thread-1" }) });
    expect(redirect).not.toHaveBeenCalled();
    expect(element.props).toMatchObject({ threadId: "thread-1" });
  });
});
