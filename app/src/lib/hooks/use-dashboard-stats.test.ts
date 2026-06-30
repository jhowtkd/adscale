import { describe, it, expect } from "vitest";
import { normalizeDashboardStats } from "./use-dashboard-stats";
import type { DashboardStats } from "@/server/repositories/dashboard";

describe("normalizeDashboardStats", () => {
  it("converts ISO date strings from JSON into Date instances", () => {
    const raw = {
      totalCampaigns: 1,
      campaignsChange: 0,
      totalDerivations: 2,
      derivationsThisMonth: 1,
      derivationsChange: 0,
      approvedDerivations: 1,
      approvalRate: 50,
      approvalChange: 0,
      avgGenerationTimeSeconds: 0,
      creditsRemaining: 100,
      creditsUsedThisMonth: 0,
      creditsTotal: 100,
      creditUsageSeries: [],
      recentCampaigns: [
        {
          id: "c1",
          name: "Campaign",
          thumbnailUrl: null,
          pieceCount: 1,
          approvedCount: 0,
          status: "active",
          updatedAt: "2026-06-30T12:00:00.000Z",
        },
      ],
      recentActivity: [
        {
          id: "a1",
          type: "derivation_approved",
          description: "Approved",
          metadata: {},
          createdAt: "2026-06-29T08:00:00.000Z",
        },
      ],
      subscription: { planKey: null, status: "inactive" },
    } as unknown as DashboardStats;

    const stats = normalizeDashboardStats(raw);

    expect(stats.recentCampaigns[0]?.updatedAt).toBeInstanceOf(Date);
    expect(stats.recentCampaigns[0]?.updatedAt.getTime()).toBe(
      new Date("2026-06-30T12:00:00.000Z").getTime()
    );
    expect(stats.recentActivity[0]?.createdAt).toBeInstanceOf(Date);
    expect(stats.recentActivity[0]?.createdAt.getTime()).toBe(
      new Date("2026-06-29T08:00:00.000Z").getTime()
    );
  });
});
