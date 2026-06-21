import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/repositories/admin-users", () => ({
  getAdminUserMirror: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { getAdminUserMirror } from "@/server/repositories/admin-users";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockGetAdminUserMirror = vi.mocked(getAdminUserMirror);

const MIRROR_FIXTURE = {
  user: { name: "Alice", email: "alice@test.com" },
  workspace: {
    id: "ws-1",
    name: "Alice Workspace",
    creditBalance: 12,
    remainingAds: 3,
  },
  recentCampaigns: [
    {
      id: "camp-1",
      name: "Summer Launch",
      status: "active",
      derivationCount: 4,
    },
  ],
};

describe("GET /api/admin/users/[id]/mirror", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
    mockGetAdminUserMirror.mockResolvedValue(MIRROR_FIXTURE);
  });

  it("returns mirror snapshot for platform owner", async () => {
    const res = await GET(
      new Request("http://localhost/api/admin/users/user-1/mirror"),
      { params: Promise.resolve({ id: "user-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(MIRROR_FIXTURE);
    expect(mockGetAdminUserMirror).toHaveBeenCalledWith("user-1");
  });

  it("does not expose sensitive fields", async () => {
    const res = await GET(
      new Request("http://localhost/api/admin/users/user-1/mirror"),
      { params: Promise.resolve({ id: "user-1" }) }
    );

    const body = await res.json();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/password|accessToken|inputPrompt|modelResponse/i);
  });

  it("returns 404 when user is not found", async () => {
    mockGetAdminUserMirror.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/admin/users/missing/mirror"),
      { params: Promise.resolve({ id: "missing" }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 403 for non-platform-owner", async () => {
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await GET(
      new Request("http://localhost/api/admin/users/user-1/mirror"),
      { params: Promise.resolve({ id: "user-1" }) }
    );

    expect(res.status).toBe(403);
    expect(mockGetAdminUserMirror).not.toHaveBeenCalled();
  });
});
