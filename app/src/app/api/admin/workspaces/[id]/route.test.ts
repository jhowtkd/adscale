import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH } from "./route";

vi.mock("@/server/auth/platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/repositories/admin-workspaces", () => ({
  getAdminWorkspaceDetail: vi.fn(),
  applyAdminWorkspaceAction: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/platform-owner";
import {
  applyAdminWorkspaceAction,
  getAdminWorkspaceDetail,
} from "@/server/repositories/admin-workspaces";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockGetAdminWorkspaceDetail = vi.mocked(getAdminWorkspaceDetail);
const mockApplyAdminWorkspaceAction = vi.mocked(applyAdminWorkspaceAction);

const DETAIL_FIXTURE = {
  workspace: {
    id: "ws-1",
    name: "Acme",
    slug: "acme",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-02T00:00:00.000Z",
  },
  members: [
    {
      id: "member-1",
      userId: "user-1",
      name: "Alice",
      email: "alice@test.com",
      role: "owner",
      joinedAt: "2024-01-01T00:00:00.000Z",
    },
  ],
  campaignCount: 3,
  billing: {
    planKey: "growth",
    creditBalance: 42,
    remainingAds: 8,
    kind: "paid",
    label: "Assinatura ativa",
    subscriptionStatus: "active",
  },
  creditTransactions: [],
};

describe("GET /api/admin/workspaces/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
    mockGetAdminWorkspaceDetail.mockResolvedValue(DETAIL_FIXTURE);
  });

  it("returns workspace detail for platform owner", async () => {
    const res = await GET(new Request("http://localhost/api/admin/workspaces/ws-1"), {
      params: Promise.resolve({ id: "ws-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(DETAIL_FIXTURE);
    expect(mockGetAdminWorkspaceDetail).toHaveBeenCalledWith("ws-1");
  });

  it("returns 404 when workspace is not found", async () => {
    mockGetAdminWorkspaceDetail.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/admin/workspaces/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 403 for non-platform-owner", async () => {
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await GET(new Request("http://localhost/api/admin/workspaces/ws-1"), {
      params: Promise.resolve({ id: "ws-1" }),
    });

    expect(res.status).toBe(403);
    expect(mockGetAdminWorkspaceDetail).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/workspaces/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
    mockApplyAdminWorkspaceAction.mockResolvedValue(undefined);
  });

  it("applies adjust_credits action with reason", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/admin/workspaces/ws-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "adjust_credits",
          delta: 10,
          reason: "Support credit grant",
        }),
      }),
      { params: Promise.resolve({ id: "ws-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(mockApplyAdminWorkspaceAction).toHaveBeenCalledWith(
      "ws-1",
      "adjust_credits",
      {
        action: "adjust_credits",
        delta: 10,
        reason: "Support credit grant",
      },
      "owner@test.com",
      "Support credit grant"
    );
  });

  it("applies override_plan action with reason", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/admin/workspaces/ws-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "override_plan",
          planKey: "scale",
          reason: "Enterprise beta upgrade",
        }),
      }),
      { params: Promise.resolve({ id: "ws-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockApplyAdminWorkspaceAction).toHaveBeenCalledWith(
      "ws-1",
      "override_plan",
      {
        action: "override_plan",
        planKey: "scale",
        reason: "Enterprise beta upgrade",
      },
      "owner@test.com",
      "Enterprise beta upgrade"
    );
  });

  it("returns 400 when reason is missing", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/admin/workspaces/ws-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "adjust_credits", delta: 5, reason: "" }),
      }),
      { params: Promise.resolve({ id: "ws-1" }) }
    );

    expect(res.status).toBe(400);
    expect(mockApplyAdminWorkspaceAction).not.toHaveBeenCalled();
  });
});
