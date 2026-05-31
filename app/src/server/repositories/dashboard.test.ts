import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./campaign", () => ({
  getCampaigns: vi.fn(),
  getWorkspaceCampaignCount: vi.fn(),
  getCampaignPeriodCounts: vi.fn(),
}));

vi.mock("./derivation", () => ({
  getDerivationDashboardAnalytics: vi.fn(),
}));

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
import { getDerivationDashboardAnalytics } from "./derivation";
import { getAvailableCreditGrants, getActiveSubscriptionByWorkspace } from "./billing";
import { getCreditTransactionsForWorkspace } from "./credit-transactions";
import { getDashboardStats } from "./dashboard";

const mockGetCampaigns = vi.mocked(getCampaigns);
const mockGetWorkspaceCampaignCount = vi.mocked(getWorkspaceCampaignCount);
const mockGetCampaignPeriodCounts = vi.mocked(getCampaignPeriodCounts);
const mockGetDerivationDashboardAnalytics = vi.mocked(getDerivationDashboardAnalytics);
const mockGetAvailableCreditGrants = vi.mocked(getAvailableCreditGrants);
const mockGetActiveSubscriptionByWorkspace = vi.mocked(getActiveSubscriptionByWorkspace);
const mockGetCreditTransactionsForWorkspace = vi.mocked(getCreditTransactionsForWorkspace);

describe("getDashboardStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(result.creditUsageSeries).toHaveLength(7);
    expect(mockGetDerivationDashboardAnalytics).toHaveBeenCalledWith(
      "ws-1",
      expect.any(Date),
      expect.any(Date)
    );
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
});
