import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

vi.mock("@/server/repositories/credit-transactions", () => ({
  getCreditTransactionsForWorkspace: vi.fn(),
  getCreditTransactionSummary: vi.fn(),
  getCampaignsWithTransactions: vi.fn(),
}));

vi.mock("@/server/repositories/billing", () => ({
  getAvailableCreditGrants: vi.fn(),
  getCreditGrantHistoryForWorkspace: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/billing/access", () => ({
  getWorkspaceBillingAccess: vi.fn(),
}));

import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getWorkspaceBillingAccess } from "@/server/billing/access";
import {
  getAvailableCreditGrants,
  getCreditGrantHistoryForWorkspace,
} from "@/server/repositories/billing";
import {
  getCampaignsWithTransactions,
  getCreditTransactionSummary,
  getCreditTransactionsForWorkspace,
} from "@/server/repositories/credit-transactions";
import { GET } from "./route";

const mockRequireWorkspaceAccess = vi.mocked(requireWorkspaceAccess);
const mockGetTransactions = vi.mocked(getCreditTransactionsForWorkspace);
const mockGetSummary = vi.mocked(getCreditTransactionSummary);
const mockGetGrants = vi.mocked(getAvailableCreditGrants);
const mockGetGrantHistory = vi.mocked(getCreditGrantHistoryForWorkspace);
const mockGetCampaigns = vi.mocked(getCampaignsWithTransactions);
const mockGetBillingAccess = vi.mocked(getWorkspaceBillingAccess);

describe("billing history route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireWorkspaceAccess.mockResolvedValue({
      workspace: { id: "workspace-1", name: "Test", slug: "test" },
      user: { id: "user-1", email: "test@example.com", name: "Test" },
    } as Awaited<ReturnType<typeof requireWorkspaceAccess>>);
    mockGetTransactions.mockResolvedValue([]);
    mockGetSummary.mockResolvedValue({ totalSpent: 0, transactionCount: 0 });
    mockGetGrants.mockResolvedValue([]);
    mockGetGrantHistory.mockResolvedValue([]);
    mockGetCampaigns.mockResolvedValue([]);
    mockGetBillingAccess.mockResolvedValue({
      kind: "paid",
      label: "Assinatura ativa",
      creditBalance: 80,
      remainingAds: 2,
      hasSpendAccess: true,
      subscriptionStatus: "active",
      subscription: null,
      latestSubscription: null,
      betaEntitlement: null,
    } as Awaited<ReturnType<typeof getWorkspaceBillingAccess>>);
  });

  it("returns grant ledger entries with source, amount, and date", async () => {
    mockGetGrantHistory.mockResolvedValue([
      {
        id: "grant-1",
        workspaceId: "workspace-1",
        source: "stripe_invoice",
        sourceId: "inv_123",
        amount: 120,
        remaining: 80,
        expiresAt: null,
        createdAt: new Date("2026-05-01T12:00:00.000Z"),
        updatedAt: new Date("2026-05-01T12:00:00.000Z"),
      },
      {
        id: "grant-2",
        workspaceId: "workspace-1",
        source: "beta_tester",
        sourceId: "ent-1",
        amount: 50,
        remaining: 0,
        expiresAt: null,
        createdAt: new Date("2026-04-15T09:00:00.000Z"),
        updatedAt: new Date("2026-04-20T09:00:00.000Z"),
      },
    ]);

    const response = await GET(new Request("http://localhost/api/billing/history"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.grants).toEqual([
      {
        id: "grant-1",
        source: "stripe_invoice",
        amount: 120,
        remaining: 80,
        createdAt: "2026-05-01T12:00:00.000Z",
      },
      {
        id: "grant-2",
        source: "beta_tester",
        amount: 50,
        remaining: 0,
        createdAt: "2026-04-15T09:00:00.000Z",
      },
    ]);
    expect(body.transactions).toEqual([]);
  });

  it("passes the same filters to the listing and the summary", async () => {
    const from = "2026-07-01T00:00:00.000-03:00";
    const to = "2026-09-10T23:59:59.999-03:00";
    const campaignId = "550e8400-e29b-41d4-a716-446655440001";
    mockGetSummary.mockResolvedValue({
      totalSpent: 120,
      totalAdded: 0,
      transactionCount: 3,
      distinctCampaignCount: 2,
    });

    const response = await GET(
      new Request(
        `http://localhost/api/billing/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&campaignId=${campaignId}`
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    const expectedFilters = {
      from: new Date(from),
      to: new Date(to),
      campaignId,
    };
    expect(mockGetTransactions).toHaveBeenCalledWith("workspace-1", expectedFilters);
    expect(mockGetSummary).toHaveBeenCalledWith("workspace-1", expectedFilters);
    // Average uses distinct campaigns inside the same recorte, not the all-time list.
    expect(body.summary.averagePerCampaign).toBe(60);
  });

  it("keeps the campaign filter options all-time while the average stays in-recorte", async () => {
    mockGetSummary.mockResolvedValue({
      totalSpent: 100,
      totalAdded: 0,
      transactionCount: 2,
      distinctCampaignCount: 1,
    });
    mockGetCampaigns.mockResolvedValue([
      { campaignId: "campaign-a", campaignName: "A" },
      { campaignId: "campaign-b", campaignName: "B" },
    ]);

    const response = await GET(new Request("http://localhost/api/billing/history"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.campaigns).toHaveLength(2);
    expect(body.summary.averagePerCampaign).toBe(100);
  });

  it("reports the canonical balance even when the recorte is empty", async () => {
    mockGetSummary.mockResolvedValue({
      totalSpent: 0,
      totalAdded: 0,
      transactionCount: 0,
      distinctCampaignCount: 0,
    });

    const response = await GET(
      new Request(
        "http://localhost/api/billing/history?from=2026-09-01T00:00:00.000-03:00&to=2026-09-10T23:59:59.999-03:00"
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary).toEqual({
      totalSpent: 0,
      remainingCredits: 80,
      averagePerCampaign: 0,
      transactionCount: 0,
    });
    expect(body.transactions).toEqual([]);
  });

  it("rejects invalid dates, inverted ranges, and non-uuid campaign ids", async () => {
    for (const url of [
      "http://localhost/api/billing/history?from=not-a-date",
      "http://localhost/api/billing/history?to=2026-02-31",
      "http://localhost/api/billing/history?from=2026-02-31T12:00:00Z",
      "http://localhost/api/billing/history?to=2026-09-10T23:59:59.999",
      "http://localhost/api/billing/history?from=2026-09-10T00:00:00.000Z&to=2026-09-01T00:00:00.000Z",
      "http://localhost/api/billing/history?campaignId=not-a-uuid",
    ]) {
      const response = await GET(new Request(url));
      expect(response.status).toBe(400);
    }
    expect(mockGetTransactions).not.toHaveBeenCalled();
    expect(mockGetSummary).not.toHaveBeenCalled();
  });

  it("accepts date-only params as the full UTC day", async () => {
    const response = await GET(
      new Request("http://localhost/api/billing/history?from=2026-09-01&to=2026-09-10")
    );

    expect(response.status).toBe(200);
    expect(mockGetTransactions).toHaveBeenCalledWith("workspace-1", {
      from: new Date("2026-09-01T00:00:00.000Z"),
      to: new Date("2026-09-10T23:59:59.999Z"),
      campaignId: undefined,
    });
  });
});
