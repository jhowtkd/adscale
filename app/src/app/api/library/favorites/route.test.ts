import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "./route";

const accessMock = vi.hoisted(() => vi.fn());
const listMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: (...args: unknown[]) => accessMock(...args),
}));

vi.mock("@/server/repositories/piece-favorites", () => ({
  listPieceFavorites: (...args: unknown[]) => listMock(...args),
}));

describe("GET /api/library/favorites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessMock.mockResolvedValue({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    });
  });

  it("lists only the signed-in user's favorites in the workspace", async () => {
    listMock.mockResolvedValue([
      {
        id: "fav-1",
        outputId: "output-1",
        workItemId: "work-1",
        name: "Peça",
        createdAt: new Date("2026-09-13T12:00:00.000Z"),
        downloadHref: "/api/creative-work/work-1/outputs/output-1/download",
      },
    ]);
    const res = await GET(new Request("http://localhost/api/library/favorites"));
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ outputId: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.outputId).toBe("output-1");
    expect(listMock).toHaveBeenCalledWith({ workspaceId: "workspace-1", userId: "user-1" });
  });
});
