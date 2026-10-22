import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

vi.mock("@/server/repositories/credit-transactions", () => ({
  getCreditTransactionPage: vi.fn(),
  getCreditTransactionSummary: vi.fn(),
  getCreditUsageSeries: vi.fn(),
  getCampaignsWithTransactions: vi.fn(),
}));

vi.mock("@/server/repositories/billing", () => ({
  getCreditGrantPage: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/billing/access", () => ({
  getWorkspaceBillingAccess: vi.fn(),
}));

import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getWorkspaceBillingAccess } from "@/server/billing/access";
import { AUTH_ERROR_CODES, WorkspaceAuthError } from "@/server/auth/errors";
import { encodeKeysetCursor } from "@/lib/keyset-page";
import { getCreditGrantPage } from "@/server/repositories/billing";
import {
  getCampaignsWithTransactions,
  getCreditTransactionPage,
  getCreditTransactionSummary,
  getCreditUsageSeries,
} from "@/server/repositories/credit-transactions";
import { GET } from "./route";

const mockRequireWorkspaceAccess = vi.mocked(requireWorkspaceAccess);
const mockGetTransactions = vi.mocked(getCreditTransactionPage);
const mockGetSummary = vi.mocked(getCreditTransactionSummary);
const mockGetSeries = vi.mocked(getCreditUsageSeries);
const mockGetGrantPage = vi.mocked(getCreditGrantPage);
const mockGetCampaigns = vi.mocked(getCampaignsWithTransactions);
const mockGetBillingAccess = vi.mocked(getWorkspaceBillingAccess);

describe("billing history route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireWorkspaceAccess.mockResolvedValue({
      workspace: { id: "workspace-1", name: "Test", slug: "test" },
      user: { id: "user-1", email: "test@example.com", name: "Test" },
    } as Awaited<ReturnType<typeof requireWorkspaceAccess>>);
    mockGetTransactions.mockResolvedValue({ items: [], nextCursor: null } as never);
    mockGetSummary.mockResolvedValue({ totalSpent: 0, transactionCount: 0 } as never);
    mockGetSeries.mockResolvedValue([]);
    mockGetGrantPage.mockResolvedValue({ items: [], nextCursor: null } as never);
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

  it("returns grant ledger entries with source, amount, and date (view=grants)", async () => {
    mockGetGrantPage.mockResolvedValue({
      items: [
        {
          id: "grant-1",
          source: "stripe_invoice",
          amount: 120,
          remaining: 80,
          createdAt: new Date("2026-05-01T12:00:00.000Z"),
          sortAt: "2026-05-01T12:00:00.000000Z",
        },
      ],
      nextCursor: "next-grants",
    } as never);

    const response = await GET(new Request("http://localhost/api/billing/history?view=grants"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      grants: [
        {
          id: "grant-1",
          source: "stripe_invoice",
          amount: 120,
          remaining: 80,
          createdAt: "2026-05-01T12:00:00.000Z",
        },
      ],
      nextCursor: "next-grants",
    });
  });

  it("view=grants only reads grants and ignores period and campaign filters", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/billing/history?view=grants&from=not-a-date&campaignId=nope&limit=7"
      )
    );

    expect(response.status).toBe(200);
    expect(mockGetGrantPage).toHaveBeenCalledWith("workspace-1", { limit: 7, cursor: null });
    expect(mockGetTransactions).not.toHaveBeenCalled();
    expect(mockGetSummary).not.toHaveBeenCalled();
    expect(mockGetSeries).not.toHaveBeenCalled();
    expect(mockGetCampaigns).not.toHaveBeenCalled();
    expect(mockGetBillingAccess).not.toHaveBeenCalled();
  });

  it("first page returns transactions, nextCursor, summary, usageSeries and campaigns", async () => {
    mockGetSeries.mockResolvedValue([{ date: "2026-09-01", amount: 5 }]);
    mockGetTransactions.mockResolvedValue({
      items: [
        {
          id: "t1",
          userId: "u",
          workspaceId: "workspace-1",
          campaignId: null,
          campaignName: null,
          derivationId: null,
          amount: -5,
          type: "usage",
          description: "d",
          createdAt: new Date("2026-09-01T10:00:00.000Z"),
          sortAt: "2026-09-01T10:00:00.000000Z",
        },
      ],
      nextCursor: "abc",
    } as never);

    const body = await (await GET(new Request("http://localhost/api/billing/history"))).json();

    expect(body.transactions).toHaveLength(1);
    expect(body.transactions[0]).not.toHaveProperty("sortAt");
    expect(body.nextCursor).toBe("abc");
    expect(body.usageSeries).toEqual([{ date: "2026-09-01", amount: 5 }]);
    expect(body).toHaveProperty("summary");
    expect(body).toHaveProperty("campaigns");
  });

  it("passes the default limit 50 and no cursor on the first page", async () => {
    await GET(new Request("http://localhost/api/billing/history"));
    expect(mockGetTransactions).toHaveBeenCalledWith(
      "workspace-1",
      { from: undefined, to: undefined, campaignId: undefined },
      { limit: 50, cursor: null }
    );
  });

  it("a cursor page skips summary, series, access and campaigns and omits those keys", async () => {
    const cursor = { at: "2026-09-01T10:00:00.123456Z", id: "0b8f7a52-3c1e-4d2a-9f6b-1a2b3c4d5e6f" };
    const response = await GET(
      new Request(
        `http://localhost/api/billing/history?limit=10&cursor=${encodeKeysetCursor(cursor)}`
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["nextCursor", "transactions"]);
    expect(mockGetTransactions).toHaveBeenCalledWith(
      "workspace-1",
      { from: undefined, to: undefined, campaignId: undefined },
      { limit: 10, cursor }
    );
    expect(mockGetSummary).not.toHaveBeenCalled();
    expect(mockGetSeries).not.toHaveBeenCalled();
    expect(mockGetBillingAccess).not.toHaveBeenCalled();
    expect(mockGetCampaigns).not.toHaveBeenCalled();
  });

  it.each([
    ["limit=0"],
    ["limit=101"],
    ["limit=abc"],
    ["cursor=corrupted"],
    [`cursor=${Buffer.from(JSON.stringify({ v: 2, at: "2026-09-01T10:00:00.123456Z", id: "0b8f7a52-3c1e-4d2a-9f6b-1a2b3c4d5e6f" })).toString("base64url")}`],
    ["view=unknown"],
    ["view=grants&limit=0"],
    ["view=grants&cursor=corrupted"],
  ])("answers 400 without touching the repositories for %s", async (query) => {
    const response = await GET(new Request(`http://localhost/api/billing/history?${query}`));
    expect(response.status).toBe(400);
    expect(mockGetTransactions).not.toHaveBeenCalled();
    expect(mockGetSummary).not.toHaveBeenCalled();
    expect(mockGetSeries).not.toHaveBeenCalled();
    expect(mockGetGrantPage).not.toHaveBeenCalled();
  });

  it.each([
    [AUTH_ERROR_CODES.unauthorized, 401],
    [AUTH_ERROR_CODES.noWorkspace, 403],
    [AUTH_ERROR_CODES.forbidden, 403],
  ])("keeps the access failure status (%s)", async (code, status) => {
    mockRequireWorkspaceAccess.mockRejectedValue(new WorkspaceAuthError(code, "x"));
    for (const query of ["", "?view=grants"]) {
      const response = await GET(new Request(`http://localhost/api/billing/history${query}`));
      expect(response.status).toBe(status);
    }
    expect(mockGetTransactions).not.toHaveBeenCalled();
    expect(mockGetGrantPage).not.toHaveBeenCalled();
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
    } as never);

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
    expect(mockGetTransactions).toHaveBeenCalledWith("workspace-1", expectedFilters, {
      limit: 50,
      cursor: null,
    });
    expect(mockGetSummary).toHaveBeenCalledWith("workspace-1", expectedFilters);
    expect(mockGetSeries).toHaveBeenCalledWith("workspace-1", expectedFilters);
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
      // Year 0 parses in JS but Postgres refuses it.
      "http://localhost/api/billing/history?from=0000-01-01T00:00:00Z",
      "http://localhost/api/billing/history?to=0000-01-01",
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
    expect(mockGetTransactions).toHaveBeenCalledWith(
      "workspace-1",
      {
        from: new Date("2026-09-01T00:00:00.000Z"),
        to: new Date("2026-09-10T23:59:59.999Z"),
        campaignId: undefined,
      },
      { limit: 50, cursor: null }
    );
  });
});
