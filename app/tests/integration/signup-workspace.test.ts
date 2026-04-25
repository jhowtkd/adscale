import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
  },
}));

import { db } from "@/server/db";
import { createWorkspace, addMember } from "@/server/repositories/workspace";

describe("signup workspace flow", () => {
  it("creates a workspace on first signup", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "ws-1", name: "Test Workspace" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const workspace = await createWorkspace({
      name: "Test Workspace",
      slug: "test-workspace",
    });

    expect(workspace).toEqual({ id: "ws-1", name: "Test Workspace" });
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Test Workspace", slug: "test-workspace" })
    );
  });

  it("creates workspace membership with owner role", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "mem-1", role: "owner" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const member = await addMember("ws-1", "user-1", "owner");

    expect(member).toEqual({ id: "mem-1", role: "owner" });
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", userId: "user-1", role: "owner" })
    );
  });
});
