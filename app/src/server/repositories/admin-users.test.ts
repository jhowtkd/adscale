import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("../billing/access", () => ({
  getWorkspaceBillingAccess: vi.fn(),
}));

vi.mock("./admin-dashboard", () => ({
  pickPrimaryWorkspaceByUser: vi.fn(),
}));

import { db } from "../db";
import { getWorkspaceBillingAccess } from "../billing/access";
import { pickPrimaryWorkspaceByUser } from "./admin-dashboard";
import { searchAdminUsers } from "./admin-users";

const mockGetWorkspaceBillingAccess = vi.mocked(getWorkspaceBillingAccess);
const mockPickPrimaryWorkspaceByUser = vi.mocked(pickPrimaryWorkspaceByUser);

const USER_ROW = {
  id: "user-1",
  name: "Alice",
  email: "alice@test.com",
  emailVerified: true,
  onboardingCompletedAt: new Date("2024-01-02"),
  createdAt: new Date("2024-01-01"),
};

function countResult(value: number) {
  const rows = [{ value }];
  const promise = Promise.resolve(rows);
  const query = {
    where: vi.fn().mockReturnValue(promise),
    then: promise.then.bind(promise),
  };

  return {
    from: vi.fn(() => query),
  };
}

function listUsersResult(rows: typeof USER_ROW[]) {
  const queryPromise = Promise.resolve(rows);
  const offset = vi.fn().mockReturnValue(queryPromise);
  const limit = vi.fn(() => ({ offset }));
  const orderBy = vi.fn(() => ({ limit, offset }));
  const where = vi.fn(() => ({ orderBy, limit, offset }));
  const dynamic = vi.fn(() => ({ where, orderBy, limit, offset }));

  return {
    from: vi.fn(() => ({ $dynamic: dynamic })),
  };
}

function activityResult(rows: Array<{ userId: string; lastActivityAt: Date }>) {
  const groupBy = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ groupBy }));
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
    workspaceName: string;
  }>
) {
  const where = vi.fn().mockResolvedValue(rows);
  const innerJoinWorkspace = vi.fn(() => ({ where }));
  const innerJoinMembers = vi.fn(() => ({ innerJoin: innerJoinWorkspace }));
  return {
    from: vi.fn(() => ({ innerJoin: innerJoinMembers })),
  };
}

describe("searchAdminUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPickPrimaryWorkspaceByUser.mockReturnValue(
      new Map([
        [
          "user-1",
          {
            userId: "user-1",
            email: "alice@test.com",
            workspaceId: "ws-1",
          },
        ],
      ])
    );
    mockGetWorkspaceBillingAccess.mockResolvedValue({
      kind: "paid",
      label: "Active",
      creditBalance: 12,
      remainingAds: 3,
      hasSpendAccess: true,
      subscriptionStatus: "active",
      subscription: { planKey: "growth" } as never,
      latestSubscription: null,
      betaEntitlement: null,
    });
  });

  it("returns paginated users enriched with workspace billing", async () => {
    const usersQuery = listUsersResult([USER_ROW]);
    const countQuery = countResult(1);
    const activityQuery = activityResult([
      { userId: "user-1", lastActivityAt: new Date("2024-06-01") },
    ]);
    const membershipsQuery = membershipResult([
      {
        userId: "user-1",
        email: "alice@test.com",
        workspaceId: "ws-1",
        role: "owner",
        memberCreatedAt: new Date("2024-01-01"),
        workspaceName: "Alice Workspace",
      },
    ]);

    vi.mocked(db.select)
      .mockReturnValueOnce(countQuery as never)
      .mockReturnValueOnce(usersQuery as never)
      .mockReturnValueOnce(activityQuery as never)
      .mockReturnValueOnce(membershipsQuery as never);

    const result = await searchAdminUsers({ page: 1, pageSize: 20 });

    expect(result.total).toBe(1);
    expect(result.users).toHaveLength(1);
    expect(result.users[0]).toEqual({
      id: "user-1",
      name: "Alice",
      email: "alice@test.com",
      emailVerified: true,
      onboardingCompleted: true,
      createdAt: USER_ROW.createdAt.toISOString(),
      lastActivityAt: new Date("2024-06-01").toISOString(),
      primaryWorkspace: {
        id: "ws-1",
        name: "Alice Workspace",
        planKey: "growth",
        creditBalance: 12,
      },
    });
    expect(mockGetWorkspaceBillingAccess).toHaveBeenCalledWith("ws-1");
  });

  it("filters zero-credit users when creditsZero is enabled", async () => {
    const usersQuery = listUsersResult([USER_ROW]);
    const activityQuery = activityResult([]);
    const membershipsQuery = membershipResult([
      {
        userId: "user-1",
        email: "alice@test.com",
        workspaceId: "ws-1",
        role: "owner",
        memberCreatedAt: new Date("2024-01-01"),
        workspaceName: "Alice Workspace",
      },
    ]);

    mockGetWorkspaceBillingAccess.mockResolvedValue({
      kind: "none",
      label: "No access",
      creditBalance: 0,
      remainingAds: null,
      hasSpendAccess: false,
      subscriptionStatus: "none",
      subscription: null,
      latestSubscription: null,
      betaEntitlement: null,
    });

    vi.mocked(db.select)
      .mockReturnValueOnce(usersQuery as never)
      .mockReturnValueOnce(activityQuery as never)
      .mockReturnValueOnce(membershipsQuery as never);

    const result = await searchAdminUsers({ creditsZero: true, page: 1, pageSize: 20 });

    expect(result.users).toHaveLength(1);
    expect(result.users[0]?.primaryWorkspace?.creditBalance).toBe(0);
    expect(result.total).toBe(1);
  });
});
