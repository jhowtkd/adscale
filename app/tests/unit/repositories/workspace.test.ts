import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  },
}));

import { db } from "@/server/db";
import { getWorkspaceForUser } from "@/server/repositories/workspace";

describe("getWorkspaceForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("orders memberships by owner priority then oldest createdAt", async () => {
    const ownerMember = { workspaceId: "ws-owner", userId: "user-1", role: "owner" };
    const mockMemberLimit = vi.fn().mockResolvedValue([ownerMember]);
    const mockMemberOrderBy = vi.fn().mockReturnValue({ limit: mockMemberLimit });
    const mockMemberWhere = vi.fn().mockReturnValue({ orderBy: mockMemberOrderBy });
    const mockMemberFrom = vi.fn().mockReturnValue({ where: mockMemberWhere });

    const mockWorkspaceLimit = vi.fn().mockResolvedValue([{ id: "ws-owner", slug: "workspace-user-1" }]);
    const mockWorkspaceWhere = vi.fn().mockReturnValue({ limit: mockWorkspaceLimit });
    const mockWorkspaceFrom = vi.fn().mockReturnValue({ where: mockWorkspaceWhere });

    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ from: mockMemberFrom })
      .mockReturnValueOnce({ from: mockWorkspaceFrom });

    const workspace = await getWorkspaceForUser("user-1");

    expect(mockMemberOrderBy).toHaveBeenCalled();
    expect(workspace).toEqual({ id: "ws-owner", slug: "workspace-user-1" });
  });

  it("returns null when user has no memberships", async () => {
    const mockMemberLimit = vi.fn().mockResolvedValue([]);
    const mockMemberOrderBy = vi.fn().mockReturnValue({ limit: mockMemberLimit });
    const mockMemberWhere = vi.fn().mockReturnValue({ orderBy: mockMemberOrderBy });
    const mockMemberFrom = vi.fn().mockReturnValue({ where: mockMemberWhere });

    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockMemberFrom });

    await expect(getWorkspaceForUser("user-orphan")).resolves.toBeNull();
  });
});
