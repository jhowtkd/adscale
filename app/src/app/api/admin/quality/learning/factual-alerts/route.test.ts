import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/human-quality/learning/factual-alerts", () => ({
  listFactualIssueAlerts: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { listFactualIssueAlerts } from "@/server/human-quality/learning/factual-alerts";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const CLIENT_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440003";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockListAlerts = vi.mocked(listFactualIssueAlerts);

const alertsFixture = [
  {
    workspaceId: WORKSPACE_ID,
    clientProfileId: CLIENT_PROFILE_ID,
    sliceKey: `${WORKSPACE_ID}:${CLIENT_PROFILE_ID}:factual_issue|art_variation|1:1`,
    rationale: "factual_guard_review_required" as const,
    evidenceRefs: {
      corpusItemIds: ["item-1", "item-2", "item-3"],
      stats: {
        count: 3,
        meanSignedDelta: 18,
        meanAbsError: 18,
        overScoreCount: 3,
        underScoreCount: 0,
      },
    },
  },
];

describe("GET /api/admin/quality/learning/factual-alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
    mockListAlerts.mockResolvedValue(alertsFixture);
  });

  it("returns factual alerts for platform owner", async () => {
    const res = await GET(
      new Request(
        `http://localhost/api/admin/quality/learning/factual-alerts?workspaceId=${WORKSPACE_ID}&clientProfileId=${CLIENT_PROFILE_ID}`
      )
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alerts).toHaveLength(1);
    expect(body.alerts[0].rationale).toBe("factual_guard_review_required");
    expect(mockListAlerts).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      clientProfileId: CLIENT_PROFILE_ID,
    });
  });

  it("lists all alerts when no filters are provided", async () => {
    const res = await GET(
      new Request("http://localhost/api/admin/quality/learning/factual-alerts")
    );

    expect(res.status).toBe(200);
    expect(mockListAlerts).toHaveBeenCalledWith({});
  });

  it("returns 400 for invalid query params", async () => {
    const res = await GET(
      new Request(
        "http://localhost/api/admin/quality/learning/factual-alerts?workspaceId=not-a-uuid"
      )
    );

    expect(res.status).toBe(400);
    expect(mockListAlerts).not.toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized")
    );

    const res = await GET(
      new Request("http://localhost/api/admin/quality/learning/factual-alerts")
    );

    expect(res.status).toBe(401);
    expect(mockListAlerts).not.toHaveBeenCalled();
  });

  it("returns 403 when not platform owner", async () => {
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await GET(
      new Request("http://localhost/api/admin/quality/learning/factual-alerts")
    );

    expect(res.status).toBe(403);
    expect(mockListAlerts).not.toHaveBeenCalled();
  });
});
