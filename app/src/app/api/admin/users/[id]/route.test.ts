import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH } from "./route";

vi.mock("@/server/auth/platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/repositories/admin-users", () => ({
  getAdminUserDetail: vi.fn(),
  applyAdminUserAction: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/platform-owner";
import {
  applyAdminUserAction,
  getAdminUserDetail,
} from "@/server/repositories/admin-users";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockGetAdminUserDetail = vi.mocked(getAdminUserDetail);
const mockApplyAdminUserAction = vi.mocked(applyAdminUserAction);

const DETAIL_FIXTURE = {
  profile: {
    id: "user-1",
    name: "Alice",
    email: "alice@test.com",
    locale: "pt-BR",
    emailVerified: true,
    onboardingCompleted: true,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-02T00:00:00.000Z",
  },
  workspaces: [],
  recentCampaigns: [],
  recentDerivations: [],
  lastSessionAt: null,
};

describe("GET /api/admin/users/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
    mockGetAdminUserDetail.mockResolvedValue(DETAIL_FIXTURE);
  });

  it("returns user detail for platform owner", async () => {
    const res = await GET(new Request("http://localhost/api/admin/users/user-1"), {
      params: Promise.resolve({ id: "user-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(DETAIL_FIXTURE);
    expect(mockGetAdminUserDetail).toHaveBeenCalledWith("user-1");
  });

  it("returns 404 when user is not found", async () => {
    mockGetAdminUserDetail.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/admin/users/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 403 for non-platform-owner", async () => {
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await GET(new Request("http://localhost/api/admin/users/user-1"), {
      params: Promise.resolve({ id: "user-1" }),
    });

    expect(res.status).toBe(403);
    expect(mockGetAdminUserDetail).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/users/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
    mockApplyAdminUserAction.mockResolvedValue(undefined);
  });

  it("applies verify_email action with reason", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/admin/users/user-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify_email",
          reason: "Manual verification for beta user",
        }),
      }),
      { params: Promise.resolve({ id: "user-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(mockApplyAdminUserAction).toHaveBeenCalledWith(
      "user-1",
      "verify_email",
      "Manual verification for beta user",
      "owner@test.com"
    );
  });

  it("returns 400 when reason is missing", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/admin/users/user-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_onboarding", reason: "" }),
      }),
      { params: Promise.resolve({ id: "user-1" }) }
    );

    expect(res.status).toBe(400);
    expect(mockApplyAdminUserAction).not.toHaveBeenCalled();
  });
});
