import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { BetaEventPropertiesValidationError } from "@/server/beta-analytics/sanitize";
import { WorkspaceAuthError } from "@/server/auth/errors";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/beta-analytics/record", () => ({
  recordBetaAnalyticsEvent: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";

const mockRequireWorkspaceAccess = vi.mocked(requireWorkspaceAccess);
const mockRecordBetaAnalyticsEvent = vi.mocked(recordBetaAnalyticsEvent);

const VALID_CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440000";

function createRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/analytics/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/analytics/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireWorkspaceAccess.mockResolvedValue({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    } as never);
  });

  it("returns 201 with event on valid payload", async () => {
    mockRecordBetaAnalyticsEvent.mockResolvedValue({
      id: "event-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      sessionId: null,
      eventKey: "mission_started",
      properties: { stage: "briefing" },
      source: "client",
      campaignId: null,
      derivationId: null,
      createdAt: new Date(),
    } as never);

    const res = await POST(
      createRequest(
        {
          eventKey: "mission_started",
          properties: { stage: "briefing" },
        },
        { "x-request-id": "req-1" }
      )
    );

    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.event.id).toBe("event-1");
    expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      userId: "user-1",
      source: "client",
      eventKey: "mission_started",
      properties: { stage: "briefing" },
      sessionId: undefined,
      campaignId: undefined,
      derivationId: undefined,
    });
  });

  it("uses workspace from auth, not body override", async () => {
    mockRecordBetaAnalyticsEvent.mockResolvedValue({
      id: "event-2",
      workspaceId: "workspace-1",
      userId: "user-1",
      sessionId: null,
      eventKey: "mission_started",
      properties: {},
      source: "client",
      campaignId: null,
      derivationId: null,
      createdAt: new Date(),
    } as never);

    await POST(
      createRequest({
        eventKey: "mission_started",
        workspace_id: "attacker-workspace",
        workspaceId: "attacker-workspace",
      })
    );

    expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" })
    );
    expect(mockRecordBetaAnalyticsEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "attacker-workspace" })
    );
  });

  it("returns 400 for invalid eventKey format", async () => {
    const res = await POST(
      createRequest({
        eventKey: "Invalid-Event-Key",
        properties: {},
      })
    );

    expect(res.status).toBe(400);
    expect(mockRecordBetaAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("returns 400 when record rejects disallowed properties", async () => {
    mockRecordBetaAnalyticsEvent.mockRejectedValue(
      new BetaEventPropertiesValidationError("properties contain denied keys", {
        deniedKeys: ["prompt"],
      })
    );

    const res = await POST(
      createRequest({
        eventKey: "mission_started",
        properties: { prompt: "secret" },
      })
    );

    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe("validation_error");
    expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalled();
  });

  it("returns 400 validation_error without calling record for malformed body", async () => {
    const res = await POST(createRequest({}));

    expect(res.status).toBe(400);
    expect(mockRecordBetaAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests via requireWorkspaceAccess", async () => {
    mockRequireWorkspaceAccess.mockRejectedValue(
      new WorkspaceAuthError("unauthorized", "Not authenticated")
    );

    const res = await POST(
      createRequest({
        eventKey: "mission_started",
        campaignId: VALID_CAMPAIGN_ID,
      })
    );

    expect(res.status).toBe(401);
    expect(mockRecordBetaAnalyticsEvent).not.toHaveBeenCalled();
  });
});
