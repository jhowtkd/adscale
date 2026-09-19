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
      eventKey: "cockpit_stage_entered",
      properties: { stage: "briefing" },
      source: "client",
      campaignId: null,
      derivationId: null,
      createdAt: new Date(),
    } as never);

    const res = await POST(
      createRequest(
        {
          eventKey: "cockpit_stage_entered",
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
      eventKey: "cockpit_stage_entered",
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
      eventKey: "cockpit_stage_entered",
      properties: {},
      source: "client",
      campaignId: null,
      derivationId: null,
      createdAt: new Date(),
    } as never);

    await POST(
      createRequest({
        eventKey: "cockpit_stage_entered",
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
        eventKey: "cockpit_stage_entered",
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

  it("passes guest_draft_imported to record with the session workspace", async () => {
    mockRecordBetaAnalyticsEvent.mockResolvedValue({
      id: "event-guest",
      workspaceId: "workspace-1",
      userId: "user-1",
      sessionId: null,
      eventKey: "guest_draft_imported",
      properties: {
        creativeWorkId: "work-1",
        protocol: "single",
        referenceCount: 1,
        recovered: false,
      },
      source: "client",
      campaignId: null,
      derivationId: null,
      createdAt: new Date(),
    } as never);

    const res = await POST(
      createRequest({
        eventKey: "guest_draft_imported",
        properties: {
          creativeWorkId: "work-1",
          protocol: "single",
          referenceCount: 1,
          recovered: false,
        },
      })
    );

    expect(res.status).toBe(201);
    expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        userId: "user-1",
        eventKey: "guest_draft_imported",
      })
    );
  });

  it("rejects unauthenticated requests via requireWorkspaceAccess", async () => {
    mockRequireWorkspaceAccess.mockRejectedValue(
      new WorkspaceAuthError("unauthorized", "Not authenticated")
    );

    const res = await POST(
      createRequest({
        eventKey: "cockpit_stage_entered",
        campaignId: VALID_CAMPAIGN_ID,
      })
    );

    expect(res.status).toBe(401);
    expect(mockRecordBetaAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("uses body sessionId when present, ignoring header", async () => {
    const bodySessionId = "550e8400-e29b-41d4-a716-446655440010";
    const headerSessionId = "550e8400-e29b-41d4-a716-446655440011";

    mockRecordBetaAnalyticsEvent.mockResolvedValue({
      id: "event-3",
      workspaceId: "workspace-1",
      userId: "user-1",
      sessionId: bodySessionId,
      eventKey: "cockpit_stage_entered",
      properties: {},
      source: "client",
      campaignId: null,
      derivationId: null,
      createdAt: new Date(),
    } as never);

    await POST(
      createRequest(
        { eventKey: "cockpit_stage_entered", sessionId: bodySessionId },
        { "x-beta-session-id": headerSessionId }
      )
    );

    expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: bodySessionId })
    );
  });

  it("falls back to x-beta-session-id header when body omits sessionId", async () => {
    const headerSessionId = "550e8400-e29b-41d4-a716-446655440012";

    mockRecordBetaAnalyticsEvent.mockResolvedValue({
      id: "event-4",
      workspaceId: "workspace-1",
      userId: "user-1",
      sessionId: headerSessionId,
      eventKey: "cockpit_stage_entered",
      properties: {},
      source: "client",
      campaignId: null,
      derivationId: null,
      createdAt: new Date(),
    } as never);

    await POST(
      createRequest(
        { eventKey: "cockpit_stage_entered" },
        { "x-beta-session-id": headerSessionId }
      )
    );

    expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: headerSessionId })
    );
  });

  // Bodies mirror OutputLearningRecommendationCard.tsx recordEvent calls (R-009).
  const OUTPUT_LEARNING_CARD_BODIES = [
    {
      eventKey: "output_learning_recommendation_viewed",
      properties: {
        recommendationId: "rec-1",
        variableKey: "cta",
        confidence: "high",
        learningCount: 1,
        source: "postgres",
      },
    },
    {
      eventKey: "output_learning_recommendation_dismissed",
      properties: {
        recommendationId: "rec-1",
        variableKey: "cta",
        confidence: "high",
        reasonCode: "user_dismissed",
      },
    },
    {
      eventKey: "output_learning_recommendation_accepted",
      properties: {
        recommendationId: "rec-1",
        variableKey: "cta",
        confidence: "high",
        recipeId: "performance_push",
        action: "accept",
        traceId: "ol-trace-1",
        evidenceEventCount: 1,
        blockedFieldCount: 0,
      },
    },
    {
      eventKey: "output_learning_recommendation_edited",
      properties: {
        recommendationId: "rec-1",
        variableKey: "cta",
        confidence: "high",
        recipeId: "performance_push",
        action: "edit",
      },
    },
  ] as const;

  it.each(OUTPUT_LEARNING_CARD_BODIES)(
    "returns 201 for $eventKey with the exact card payload",
    async ({ eventKey, properties }) => {
      mockRecordBetaAnalyticsEvent.mockResolvedValue({
        id: "event-ol-1",
        workspaceId: "workspace-1",
        userId: "user-1",
        sessionId: null,
        eventKey,
        properties,
        source: "client",
        campaignId: VALID_CAMPAIGN_ID,
        derivationId: null,
        createdAt: new Date(),
      } as never);

      const res = await POST(
        createRequest({
          eventKey,
          campaignId: VALID_CAMPAIGN_ID,
          properties,
        })
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.event.eventKey).toBe(eventKey);
      expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventKey,
          campaignId: VALID_CAMPAIGN_ID,
          properties,
        })
      );
    }
  );

  it("returns 400 when record rejects an unknown output_learning_* event key", async () => {
    mockRecordBetaAnalyticsEvent.mockRejectedValue(
      new BetaEventPropertiesValidationError("unknown event_key", {
        eventKey: "output_learning_recommendation_clicked",
      })
    );

    const res = await POST(
      createRequest({
        eventKey: "output_learning_recommendation_clicked",
        campaignId: VALID_CAMPAIGN_ID,
        properties: { recommendationId: "rec-1" },
      })
    );

    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe("validation_error");
  });
});
