import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/dashboard", () => ({
  getDashboardStats: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getDashboardStats } from "@/server/repositories/dashboard";
import { requireWorkspaceAccess } from "@/server/auth/workspace";

const mockGetDashboardStats = vi.mocked(getDashboardStats);
const mockRequireWorkspaceAccess = vi.mocked(requireWorkspaceAccess);

describe("GET /api/dashboard/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns dashboard stats for the workspace", async () => {
    mockGetDashboardStats.mockResolvedValue({
      totalCampaigns: 5,
      campaignsChange: 0,
      derivationsThisMonth: 3,
      derivationsChange: 0,
      approvalRate: 80,
      approvalChange: 0,
      creditsRemaining: 200,
      creditsUsedThisMonth: 0,
      creditsTotal: 1000,
      creditUsageSeries: [],
      recentCampaigns: [],
      recentActivity: [],
      subscription: { planKey: "starter", status: "active" },
    } as unknown as Awaited<ReturnType<typeof getDashboardStats>>);

    const res = await GET(new Request("http://localhost/api/dashboard/stats"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockGetDashboardStats).toHaveBeenCalledWith("workspace-1", "month");
    expect(body.totalCampaigns).toBe(5);
    expect(body.approvalRate).toBe(80);
  });

  it("returns 401 when workspace access is unauthorized", async () => {
    mockRequireWorkspaceAccess.mockRejectedValueOnce(new Error("Unauthorized"));

    const res = await GET(new Request("http://localhost/api/dashboard/stats"));
    expect(res.status).toBe(401);
  });
});
