import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/repositories/admin-dashboard", () => ({
  getAdminDashboardSummary: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { getAdminDashboardSummary } from "@/server/repositories/admin-dashboard";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockGetSummary = vi.mocked(getAdminDashboardSummary);

const SUMMARY_FIXTURE = {
  activeUsers7d: 3,
  pendingFeedbacks: 5,
  corpusPending: 2,
  failedDerivations24h: 1,
  attention: {
    criticalFeedbacks: [
      {
        id: "fb-1",
        message: "Critical issue",
        createdAt: "2024-06-01T00:00:00.000Z",
      },
    ],
    zeroCreditUsers: [
      {
        userId: "user-1",
        email: "zero@test.com",
        workspaceId: "ws-1",
      },
    ],
    staleCorpusItems: [
      {
        id: "corpus-1",
        selectedAt: "2024-05-01T00:00:00.000Z",
      },
    ],
  },
};

describe("GET /api/admin/dashboard/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
    mockGetSummary.mockResolvedValue(SUMMARY_FIXTURE);
  });

  it("returns dashboard summary for platform owner", async () => {
    const res = await GET(new Request("http://localhost/api/admin/dashboard/summary"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(SUMMARY_FIXTURE);
    expect(mockGetSummary).toHaveBeenCalledOnce();
  });

  it("returns 403 for non-platform-owner", async () => {
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await GET(new Request("http://localhost/api/admin/dashboard/summary"));

    expect(res.status).toBe(403);
    expect(mockGetSummary).not.toHaveBeenCalled();
  });
});
