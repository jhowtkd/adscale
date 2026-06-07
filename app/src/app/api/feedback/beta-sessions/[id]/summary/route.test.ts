import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/repositories/beta-sessions", () => ({
  buildBetaSessionSummary: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { buildBetaSessionSummary } from "@/server/repositories/beta-sessions";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440001";

describe("GET /api/feedback/beta-sessions/[id]/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requirePlatformOwner).mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
  });

  it("returns session summary JSON", async () => {
    vi.mocked(buildBetaSessionSummary).mockResolvedValue({
      sessionId: SESSION_ID,
      workspaceId: "550e8400-e29b-41d4-a716-446655440002",
      cohortLabel: "beta-cohort-1",
      assistanceLevel: "hands_on",
      startedAt: "2026-06-07T10:00:00.000Z",
      endedAt: null,
      stagesCompleted: [{ stage: "setup", completedAt: "2026-06-07T10:05:00.000Z" }],
      blockers: [],
      feedbackReportIds: [],
      eventIds: ["event-1"],
      operatorNotes: {},
    });

    const res = await GET(
      new Request(`http://localhost/api/feedback/beta-sessions/${SESSION_ID}/summary`),
      { params: Promise.resolve({ id: SESSION_ID }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.sessionId).toBe(SESSION_ID);
    expect(body.summary.eventIds).toContain("event-1");
  });
});
