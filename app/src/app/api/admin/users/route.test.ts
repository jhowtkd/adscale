import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/repositories/admin-users", () => ({
  searchAdminUsers: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { searchAdminUsers } from "@/server/repositories/admin-users";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockSearchAdminUsers = vi.mocked(searchAdminUsers);

const LIST_FIXTURE = {
  users: [
    {
      id: "user-1",
      name: "Alice",
      email: "alice@test.com",
      emailVerified: true,
      onboardingCompleted: true,
      createdAt: "2024-01-01T00:00:00.000Z",
      lastActivityAt: "2024-06-01T00:00:00.000Z",
      primaryWorkspace: {
        id: "ws-1",
        name: "Alice Workspace",
        planKey: "growth",
        creditBalance: 12,
      },
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
};

describe("GET /api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
    mockSearchAdminUsers.mockResolvedValue(LIST_FIXTURE);
  });

  it("returns user list for platform owner", async () => {
    const res = await GET(new Request("http://localhost/api/admin/users?search=alice"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(LIST_FIXTURE);
    expect(mockSearchAdminUsers).toHaveBeenCalledWith(
      expect.objectContaining({ search: "alice" })
    );
  });

  it("returns 403 for non-platform-owner", async () => {
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await GET(new Request("http://localhost/api/admin/users"));

    expect(res.status).toBe(403);
    expect(mockSearchAdminUsers).not.toHaveBeenCalled();
  });
});
