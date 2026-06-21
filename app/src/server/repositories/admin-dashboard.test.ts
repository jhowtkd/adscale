import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("./human-quality-corpus", () => ({
  getCorpusOperationsProgress: vi.fn(),
}));

vi.mock("../billing/access", () => ({
  getWorkspaceBillingAccess: vi.fn(),
}));

import { db } from "../db";
import { getCorpusOperationsProgress } from "./human-quality-corpus";
import { getWorkspaceBillingAccess } from "../billing/access";
import {
  getAdminDashboardSummary,
  pickPrimaryWorkspaceByUser,
} from "./admin-dashboard";
import {
  derivations,
  feedbackReports,
  humanQualityCorpusItems,
  session,
  user,
} from "../db/schema";

const mockGetCorpusProgress = vi.mocked(getCorpusOperationsProgress);
const mockGetWorkspaceBillingAccess = vi.mocked(getWorkspaceBillingAccess);

function countResult(value: number) {
  return {
    from: vi.fn(() => ({
      where: vi.fn().mockResolvedValue([{ value }]),
    })),
  };
}

function listResult<T>(rows: T[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ orderBy }));
  return {
    from: vi.fn(() => ({ where })),
  };
}

function membershipResult(
  rows: Array<{
    userId: string;
    email: string;
    workspaceId: string;
    role: string;
    memberCreatedAt: Date;
  }>
) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn(() => ({ limit }));
  return {
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({ orderBy })),
    })),
  };
}

describe("pickPrimaryWorkspaceByUser", () => {
  it("prefers owner workspace over member workspace", () => {
    const primary = pickPrimaryWorkspaceByUser([
      {
        userId: "user-1",
        email: "a@test.com",
        workspaceId: "ws-member",
        role: "member",
        memberCreatedAt: new Date("2024-01-01"),
      },
      {
        userId: "user-1",
        email: "a@test.com",
        workspaceId: "ws-owner",
        role: "owner",
        memberCreatedAt: new Date("2024-02-01"),
      },
    ]);

    expect(primary.get("user-1")).toEqual({
      userId: "user-1",
      email: "a@test.com",
      workspaceId: "ws-owner",
    });
  });
});

describe("getAdminDashboardSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCorpusProgress.mockResolvedValue({
      totalPending: 12,
      totalEvaluated: 4,
      byCohort: {},
      byGenerationMode: {},
      byFormat: {},
      byCampaign: {},
      latestSelectedAt: null,
      latestEvaluatedAt: null,
    });
    mockGetWorkspaceBillingAccess.mockResolvedValue({
      kind: "none",
      label: "No plan",
      creditBalance: 0,
      remainingAds: null,
      hasSpendAccess: false,
      subscriptionStatus: "none",
      subscription: null,
      latestSubscription: null,
      betaEntitlement: null,
    });
  });

  it("aggregates KPI and attention lists from repository queries", async () => {
    const criticalCreatedAt = new Date("2024-06-01T10:00:00.000Z");
    const staleSelectedAt = new Date("2024-05-01T10:00:00.000Z");

    vi.mocked(db.select).mockImplementation((selection) => {
      if (selection && typeof selection === "object" && "value" in selection) {
        return countResult(7) as never;
      }

      if (selection && typeof selection === "object" && "id" in selection) {
        if ("message" in selection) {
          return listResult([
            {
              id: "fb-critical-1",
              message: "Checkout broken",
              createdAt: criticalCreatedAt,
            },
          ]) as never;
        }

        return listResult([
          {
            id: "corpus-stale-1",
            selectedAt: staleSelectedAt,
          },
        ]) as never;
      }

      return membershipResult([
        {
          userId: "user-zero",
          email: "zero@test.com",
          workspaceId: "ws-zero",
          role: "owner",
          memberCreatedAt: new Date("2024-01-01"),
        },
      ]) as never;
    });

    const summary = await getAdminDashboardSummary();

    expect(summary).toEqual({
      activeUsers7d: 7,
      pendingFeedbacks: 7,
      corpusPending: 12,
      failedDerivations24h: 7,
      attention: {
        criticalFeedbacks: [
          {
            id: "fb-critical-1",
            message: "Checkout broken",
            createdAt: criticalCreatedAt.toISOString(),
          },
        ],
        zeroCreditUsers: [
          {
            userId: "user-zero",
            email: "zero@test.com",
            workspaceId: "ws-zero",
          },
        ],
        staleCorpusItems: [
          {
            id: "corpus-stale-1",
            selectedAt: staleSelectedAt.toISOString(),
          },
        ],
      },
    });

    expect(mockGetCorpusProgress).toHaveBeenCalledWith(undefined);
    expect(mockGetWorkspaceBillingAccess).toHaveBeenCalledWith("ws-zero");
    expect(db.select).toHaveBeenCalled();
    expect(session).toBeDefined();
    expect(feedbackReports).toBeDefined();
    expect(derivations).toBeDefined();
    expect(humanQualityCorpusItems).toBeDefined();
    expect(user).toBeDefined();
  });
});
