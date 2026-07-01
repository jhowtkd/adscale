import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./campaign", () => ({
  getCampaigns: vi.fn(),
  getWorkspaceCampaignCount: vi.fn(),
  getCampaignPeriodCounts: vi.fn(),
}));

vi.mock("./derivation", () => ({
  getDerivationDashboardAnalytics: vi.fn(),
  getLatestDerivationOutputKeysByCampaignIds: vi.fn(),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    signedDownloadUrl: vi.fn(),
  },}));

vi.mock("./billing", () => ({
  getAvailableCreditGrants: vi.fn(),
  getActiveSubscriptionByWorkspace: vi.fn(),
}));

vi.mock("./credit-transactions", () => ({
  getCreditTransactionsForWorkspace: vi.fn(),
}));

import {
  getCampaigns,
  getWorkspaceCampaignCount,
  getCampaignPeriodCounts,
} from "./campaign";
import { getDerivationDashboardAnalytics, getLatestDerivationOutputKeysByCampaignIds } from "./derivation";
import { getAvailableCreditGrants, getActiveSubscriptionByWorkspace } from "./billing";
import { getCreditTransactionsForWorkspace } from "./credit-transactions";
import { objectStorage } from "@/server/storage";
import { getDashboardStats } from "./dashboard";

const mockGetCampaigns = vi.mocked(getCampaigns);
const mockGetWorkspaceCampaignCount = vi.mocked(getWorkspaceCampaignCount);
const mockGetCampaignPeriodCounts = vi.mocked(getCampaignPeriodCounts);
const mockGetDerivationDashboardAnalytics = vi.mocked(getDerivationDashboardAnalytics);
const mockGetLatestDerivationOutputKeysByCampaignIds = vi.mocked(getLatestDerivationOutputKeysByCampaignIds);
const mockGetPresignedDownloadUrl = vi.mocked(objectStorage.signedDownloadUrl);
const mockGetAvailableCreditGrants = vi.mocked(getAvailableCreditGrants);
const mockGetActiveSubscriptionByWorkspace = vi.mocked(getActiveSubscriptionByWorkspace);
const mockGetCreditTransactionsForWorkspace = vi.mocked(getCreditTransactionsForWorkspace);

describe("getDashboardStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLatestDerivationOutputKeysByCampaignIds.mockResolvedValue(new Map());
    mockGetPresignedDownloadUrl.mockResolvedValue("https://cdn.example.com/thumb.png");
  });

  it("returns aggregated dashboard stats without loading all derivations", async () => {
    mockGetWorkspaceCampaignCount.mockResolvedValue(12);
    mockGetCampaignPeriodCounts.mockResolvedValue({ thisPeriod: 2, previousPeriod: 1 });

    mockGetDerivationDashboardAnalytics.mockResolvedValue({
      totalDerivations: 100,
      derivationsThisPeriod: 10,
      derivationsPreviousPeriod: 5,
      approvedDerivations: 40,
      approvedThisPeriod: 8,
      approvedPreviousPeriod: 3,
      avgGenerationTimeSeconds: 42,
    });

    mockGetCampaigns.mockResolvedValue([
      {
        id: "camp-1",
        name: "Summer",
        status: "active",
        platforms: ["Meta"],
        updatedAt: new Date(),
        totalDerivations: 5,
        completedDerivations: 3,
      },
    ] as unknown as Awaited<ReturnType<typeof getCampaigns>>);

    mockGetAvailableCreditGrants.mockResolvedValue([
      {
        id: "grant-1",
        remaining: 500,
        amount: 1000,
      },
    ] as unknown as Awaited<ReturnType<typeof getAvailableCreditGrants>>);

    mockGetActiveSubscriptionByWorkspace.mockResolvedValue({
      planKey: "starter",
      status: "active",
    } as unknown as Awaited<ReturnType<typeof getActiveSubscriptionByWorkspace>>);

    mockGetCreditTransactionsForWorkspace.mockResolvedValue([]);

    const result = await getDashboardStats("ws-1");

    expect(result.totalCampaigns).toBe(12);
    expect(result.approvalRate).toBe(40);
    expect(result.creditsRemaining).toBe(500);
    expect(result.subscription.planKey).toBe("starter");
    expect(result.recentCampaigns).toHaveLength(1);
    expect(result.recentCampaigns[0]?.platforms).toEqual(["Meta"]);
    expect(result.recentCampaigns[0]?.thumbnailUrl).toBeNull();
    expect(result.creditUsageSeries).toHaveLength(7);
    expect(mockGetCreditTransactionsForWorkspace).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        from: expect.any(Date),
        to: expect.any(Date),
      })
    );
    expect(mockGetDerivationDashboardAnalytics).toHaveBeenCalledWith(
      "ws-1",
      expect.any(Date),
      expect.any(Date)
    );
  });

  it("maps latest derivation output to campaign thumbnail URLs", async () => {
    mockGetWorkspaceCampaignCount.mockResolvedValue(1);
    mockGetCampaignPeriodCounts.mockResolvedValue({ thisPeriod: 1, previousPeriod: 0 });
    mockGetDerivationDashboardAnalytics.mockResolvedValue({
      totalDerivations: 1,
      derivationsThisPeriod: 1,
      derivationsPreviousPeriod: 0,
      approvedDerivations: 0,
      approvedThisPeriod: 0,
      approvedPreviousPeriod: 0,
      avgGenerationTimeSeconds: 10,
    });
    mockGetCampaigns.mockResolvedValue([
      {
        id: "camp-1",
        name: "Summer",
        status: "completed",
        platforms: ["Meta"],
        updatedAt: new Date(),
        totalDerivations: 1,
        completedDerivations: 1,
      },
    ] as unknown as Awaited<ReturnType<typeof getCampaigns>>);
    mockGetLatestDerivationOutputKeysByCampaignIds.mockResolvedValue(
      new Map([["camp-1", "derivations/camp-1/output.png"]])
    );
    mockGetAvailableCreditGrants.mockResolvedValue([]);
    mockGetActiveSubscriptionByWorkspace.mockResolvedValue(null);
    mockGetCreditTransactionsForWorkspace.mockResolvedValue([]);

    const result = await getDashboardStats("ws-1");

    expect(mockGetLatestDerivationOutputKeysByCampaignIds).toHaveBeenCalledWith("ws-1", ["camp-1"]);
    expect(mockGetPresignedDownloadUrl).toHaveBeenCalledWith("derivations/camp-1/output.png");
    expect(result.recentCampaigns[0]?.thumbnailUrl).toBe("https://cdn.example.com/thumb.png");
  });

  it("computes zero approval rate when no derivations exist", async () => {
    mockGetWorkspaceCampaignCount.mockResolvedValue(0);
    mockGetCampaignPeriodCounts.mockResolvedValue({ thisPeriod: 0, previousPeriod: 0 });
    mockGetDerivationDashboardAnalytics.mockResolvedValue({
      totalDerivations: 0,
      derivationsThisPeriod: 0,
      derivationsPreviousPeriod: 0,
      approvedDerivations: 0,
      approvedThisPeriod: 0,
      approvedPreviousPeriod: 0,
      avgGenerationTimeSeconds: 0,
    });
    mockGetCampaigns.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof getCampaigns>>);
    mockGetAvailableCreditGrants.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof getAvailableCreditGrants>>);
    mockGetActiveSubscriptionByWorkspace.mockResolvedValue(null);
    mockGetCreditTransactionsForWorkspace.mockResolvedValue([]);

    const result = await getDashboardStats("ws-1");

    expect(result.totalCampaigns).toBe(0);
    expect(result.approvalRate).toBe(0);
    expect(result.creditsRemaining).toBe(0);
    expect(result.subscription.status).toBe("inactive");
  });

  it("builds 30-day credit usage series when creditRange is 30", async () => {
    mockGetWorkspaceCampaignCount.mockResolvedValue(0);
    mockGetCampaignPeriodCounts.mockResolvedValue({ thisPeriod: 0, previousPeriod: 0 });
    mockGetDerivationDashboardAnalytics.mockResolvedValue({
      totalDerivations: 0,
      derivationsThisPeriod: 0,
      derivationsPreviousPeriod: 0,
      approvedDerivations: 0,
      approvedThisPeriod: 0,
      approvedPreviousPeriod: 0,
      avgGenerationTimeSeconds: 0,
    });
    mockGetCampaigns.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof getCampaigns>>);
    mockGetAvailableCreditGrants.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof getAvailableCreditGrants>>);
    mockGetActiveSubscriptionByWorkspace.mockResolvedValue(null);
    mockGetCreditTransactionsForWorkspace.mockResolvedValue([]);

    const result = await getDashboardStats("ws-1", "month", "30");

    expect(result.creditUsageSeries).toHaveLength(30);
  });

  it("builds weekly credit usage series when creditRange is 90", async () => {
    mockGetWorkspaceCampaignCount.mockResolvedValue(0);
    mockGetCampaignPeriodCounts.mockResolvedValue({ thisPeriod: 0, previousPeriod: 0 });
    mockGetDerivationDashboardAnalytics.mockResolvedValue({
      totalDerivations: 0,
      derivationsThisPeriod: 0,
      derivationsPreviousPeriod: 0,
      approvedDerivations: 0,
      approvedThisPeriod: 0,
      approvedPreviousPeriod: 0,
      avgGenerationTimeSeconds: 0,
    });
    mockGetCampaigns.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof getCampaigns>>);
    mockGetAvailableCreditGrants.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof getAvailableCreditGrants>>);
    mockGetActiveSubscriptionByWorkspace.mockResolvedValue(null);
    mockGetCreditTransactionsForWorkspace.mockResolvedValue([]);

    const result = await getDashboardStats("ws-1", "month", "90");

    expect(result.creditUsageSeries).toHaveLength(13);
  });

  it("aggregates credit usage into daily buckets", async () => {
    mockGetWorkspaceCampaignCount.mockResolvedValue(0);
    mockGetCampaignPeriodCounts.mockResolvedValue({ thisPeriod: 0, previousPeriod: 0 });
    mockGetDerivationDashboardAnalytics.mockResolvedValue({
      totalDerivations: 0,
      derivationsThisPeriod: 0,
      derivationsPreviousPeriod: 0,
      approvedDerivations: 0,
      approvedThisPeriod: 0,
      approvedPreviousPeriod: 0,
      avgGenerationTimeSeconds: 0,
    });
    mockGetCampaigns.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof getCampaigns>>);
    mockGetAvailableCreditGrants.mockResolvedValue([
      { id: "grant-1", remaining: 100, amount: 100 },
    ] as unknown as Awaited<ReturnType<typeof getAvailableCreditGrants>>);
    mockGetActiveSubscriptionByWorkspace.mockResolvedValue(null);

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
    mockGetCreditTransactionsForWorkspace.mockResolvedValue([
      {
        id: "tx-1",
        amount: -5,
        createdAt: todayStart,
        description: "Derivation",
        campaignName: "Test",
      },
    ] as unknown as Awaited<ReturnType<typeof getCreditTransactionsForWorkspace>>);

    const result = await getDashboardStats("ws-1", "month", "7");
    const todayKey = todayStart.toISOString().split("T")[0];
    const todayPoint = result.creditUsageSeries.find((point) => point.date === todayKey);

    expect(todayPoint?.used).toBe(5);
  });
});
