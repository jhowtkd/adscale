import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./campaign", () => ({
  getCampaigns: vi.fn(),
}));

vi.mock("./derivation", () => ({
  getDerivationsByWorkspace: vi.fn(),
}));

vi.mock("./billing", () => ({
  getAvailableCreditGrants: vi.fn(),
  getActiveSubscriptionByWorkspace: vi.fn(),
}));

vi.mock("./credit-transactions", () => ({
  getCreditTransactionsForWorkspace: vi.fn(),
}));

import { getCampaigns } from "./campaign";
import { getDerivationsByWorkspace } from "./derivation";
import { getAvailableCreditGrants, getActiveSubscriptionByWorkspace } from "./billing";
import { getCreditTransactionsForWorkspace } from "./credit-transactions";
import { getDashboardStats } from "./dashboard";

const mockGetCampaigns = vi.mocked(getCampaigns);
const mockGetDerivationsByWorkspace = vi.mocked(getDerivationsByWorkspace);
const mockGetAvailableCreditGrants = vi.mocked(getAvailableCreditGrants);
const mockGetActiveSubscriptionByWorkspace = vi.mocked(getActiveSubscriptionByWorkspace);
const mockGetCreditTransactionsForWorkspace = vi.mocked(getCreditTransactionsForWorkspace);

describe("getDashboardStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns aggregated dashboard stats", async () => {
    mockGetCampaigns.mockResolvedValue([
      {
        id: "camp-1",
        name: "Summer",
        status: "active",
        platforms: ["Meta"],
        updatedAt: new Date(),
      },
    ] as unknown as Awaited<ReturnType<typeof getCampaigns>>);

    mockGetDerivationsByWorkspace.mockResolvedValue([
      {
        id: "deriv-1",
        status: "approved",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as unknown as Awaited<ReturnType<typeof getDerivationsByWorkspace>>);

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

    expect(result.totalCampaigns).toBe(1);
    expect(result.approvalRate).toBe(100);
    expect(result.creditsRemaining).toBe(500);
    expect(result.subscription.planKey).toBe("starter");
    expect(result.recentCampaigns).toHaveLength(1);
    expect(result.creditUsageSeries).toHaveLength(7);
  });

  it("computes zero approval rate when no derivations exist", async () => {
    mockGetCampaigns.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof getCampaigns>>);
    mockGetDerivationsByWorkspace.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof getDerivationsByWorkspace>>);
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
