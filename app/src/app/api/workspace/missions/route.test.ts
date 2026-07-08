import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

vi.mock("@/server/progression/missions/service", () => ({
  getWorkspaceMissions: vi.fn(),
}));

import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getWorkspaceMissions } from "@/server/progression/missions/service";
import { GET } from "./route";

const mockRequireWorkspaceAccess = vi.mocked(requireWorkspaceAccess);
const mockGetWorkspaceMissions = vi.mocked(getWorkspaceMissions);

describe("workspace missions route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireWorkspaceAccess.mockResolvedValue({
      workspace: { id: "workspace-1", name: "Lab", slug: "lab" },
      user: { id: "user-1", email: "test@example.com", name: "Test" },
    } as Awaited<ReturnType<typeof requireWorkspaceAccess>>);
  });

  it("returns workspace missions payload", async () => {
    mockGetWorkspaceMissions.mockResolvedValue({
      missions: [
        {
          key: "setup",
          status: "active",
          href: "/campaigns?new=1",
        },
      ],
      activeMissionKey: "setup",
      completedCount: 0,
      totalCount: 11,
      progressPercent: 0,
      lastCalculatedAt: "2026-06-06T00:00:00.000Z",
    });

    const response = await GET(new Request("http://localhost/api/workspace/missions"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.activeMissionKey).toBe("setup");
    expect(mockGetWorkspaceMissions).toHaveBeenCalledWith("workspace-1");
  });
});
