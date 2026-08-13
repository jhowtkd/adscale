import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const mocks = vi.hoisted(() => ({ requireWorkspaceAccess: vi.fn(), publish: vi.fn() }));
vi.mock("@/server/auth/workspace", () => ({ requireWorkspaceAccess: (...args: unknown[]) => mocks.requireWorkspaceAccess(...args) }));
vi.mock("@/server/repositories/brand-knowledge", async (original) => ({
  ...(await original<typeof import("@/server/repositories/brand-knowledge")>()),
  publishBrandKnowledgeVersion: (...args: unknown[]) => mocks.publish(...args),
}));

describe("POST brand knowledge publication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspaceAccess.mockResolvedValue({ user: { id: "user-1" }, workspace: { id: "workspace-1" } });
    mocks.publish.mockResolvedValue({ id: "version-1", versionNumber: 1, status: "active", hash: "a".repeat(64) });
  });

  it("publishes atomically under the authenticated workspace and actor", async () => {
    const response = await POST(new Request("http://localhost/api/client-profiles/profile-1/brand-knowledge/publish", { method: "POST" }), { params: Promise.resolve({ id: "profile-1" }) });
    expect(response.status).toBe(201);
    expect(mocks.publish).toHaveBeenCalledWith({ workspaceId: "workspace-1", clientProfileId: "profile-1", userId: "user-1" });
  });
});
