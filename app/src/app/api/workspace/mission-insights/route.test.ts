import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/feedback/validate-refs", () => ({
  FeedbackValidationError: class FeedbackValidationError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  validateCampaignOwnership: vi.fn(),
  validateDerivationOwnership: vi.fn(),
}));

vi.mock("@/server/mission-insights/service", () => ({
  recordMissionInsight: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { recordMissionInsight } from "@/server/mission-insights/service";

const mockRecord = vi.mocked(recordMissionInsight);

describe("POST /api/workspace/mission-insights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a mission insight", async () => {
    mockRecord.mockResolvedValue({
      id: "report-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      status: "new",
      type: "other",
      severity: "low",
      category: "mission",
      message: "[mission:preview_first]",
      followUpAllowed: false,
      route: "/campaigns/abc",
      contextKind: "campaign",
      campaignId: "camp-1",
      derivationId: null,
      assetRefs: [],
      diagnosticContext: { source: "mission_insight" },
      sentryCorrelation: {},
      contextCompleteness: {},
      internalNotes: null,
      resolutionSummary: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await POST(
      new Request("http://localhost/api/workspace/mission-insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          moment: "preview_first",
          missionKey: "preview",
          sentiment: "positive",
          reason: "clear_value",
          action: "submitted",
          campaignId: "550e8400-e29b-41d4-a716-446655440000",
          route: "/campaigns/abc",
        }),
      })
    );

    expect(res.status).toBe(201);
    expect(mockRecord).toHaveBeenCalledOnce();
  });

  it("rejects invalid moment", async () => {
    const res = await POST(
      new Request("http://localhost/api/workspace/mission-insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          moment: "unknown_moment",
          missionKey: "preview",
          action: "skipped",
        }),
      })
    );

    expect(res.status).toBe(400);
    expect(mockRecord).not.toHaveBeenCalled();
  });
});
