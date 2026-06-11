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

import { requireWorkspaceAccess } from "@/server/auth/workspace";
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
});
