import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

vi.mock("@/server/auth/team", () => ({
  getWorkspaceMembers: vi.fn(),
  removeMember: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getWorkspaceMembers, removeMember } from "@/server/auth/team";
import { DELETE, GET } from "./route";

const mockRequireWorkspaceAccess = vi.mocked(requireWorkspaceAccess);
const mockRemoveMember = vi.mocked(removeMember);
const mockGetWorkspaceMembers = vi.mocked(getWorkspaceMembers);

const access = {
  user: { id: "user-admin", email: "admin@example.com", name: "Admin" },
  workspace: { id: "workspace-1", name: "Acme Labs", slug: "acme-labs" },
};

function deleteRequest(userId: string): Request {
  return new Request(`http://localhost/api/workspace/members?userId=${userId}`, { method: "DELETE" });
}

describe("GET /api/workspace/members", () => {
  it("returns the members and who is viewing them", async () => {
    mockRequireWorkspaceAccess.mockResolvedValue(
      access as Awaited<ReturnType<typeof requireWorkspaceAccess>>
    );
    mockGetWorkspaceMembers.mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/workspace/members"));

    expect(await res.json()).toEqual({ members: [], viewerUserId: "user-admin" });
  });
});

describe("DELETE /api/workspace/members", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireWorkspaceAccess.mockResolvedValue(
      access as Awaited<ReturnType<typeof requireWorkspaceAccess>>
    );
  });

  it("passes the caller to the removal policy", async () => {
    mockRemoveMember.mockResolvedValue("removed");

    const res = await DELETE(deleteRequest("user-member"));

    expect(res.status).toBe(200);
    expect(mockRemoveMember).toHaveBeenCalledWith("workspace-1", "user-admin", "user-member");
  });

  it.each([
    ["forbidden", 403],
    ["memberNotFound", 404],
    ["cannotRemoveSelf", 400],
  ] as const)("maps %s to %i", async (result, status) => {
    mockRemoveMember.mockResolvedValue(result);

    const res = await DELETE(deleteRequest("user-owner"));

    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(result);
  });
});
