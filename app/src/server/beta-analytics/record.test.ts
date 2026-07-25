import { describe, it, expect, vi, beforeEach } from "vitest";
import { BetaEventPropertiesValidationError } from "./sanitize";
import { FeedbackValidationError } from "../feedback/validate-refs";

vi.mock("../repositories/beta-analytics", () => ({
  insertBetaAnalyticsEvent: vi.fn(),
  getBetaSessionById: vi.fn(),
}));

vi.mock("../feedback/validate-refs", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../feedback/validate-refs")>();
  return {
    ...actual,
    validateCampaignOwnership: vi.fn(),
    validateDerivationOwnership: vi.fn(),
  };
});

import { PHASE_76_BETA_EVENT_KEYS, PHASE_126_BETA_EVENT_KEYS } from "./types";
import { recordBetaAnalyticsEvent } from "./record";
import {
  insertBetaAnalyticsEvent,
  getBetaSessionById,
} from "../repositories/beta-analytics";
import {
  validateCampaignOwnership,
  validateDerivationOwnership,
} from "../feedback/validate-refs";

const mockInsert = vi.mocked(insertBetaAnalyticsEvent);
const mockGetSession = vi.mocked(getBetaSessionById);
const mockValidateCampaign = vi.mocked(validateCampaignOwnership);
const mockValidateDerivation = vi.mocked(validateDerivationOwnership);

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440001";

function mockInsertedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    workspaceId: "ws-1",
    userId: "user-1",
    sessionId: null,
    eventKey: "cockpit_stage_entered",
    properties: { stage: "briefing" },
    source: "client",
    campaignId: null,
    derivationId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("recordBetaAnalyticsEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sanitizes properties and inserts on happy path", async () => {
    mockInsert.mockResolvedValue(mockInsertedEvent() as never);

    const event = await recordBetaAnalyticsEvent({
      workspaceId: "ws-1",
      userId: "user-1",
      eventKey: "cockpit_stage_entered",
      properties: { stage: "briefing" },
    });

    expect(event.id).toBe("event-1");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        userId: "user-1",
        eventKey: "cockpit_stage_entered",
        properties: { stage: "briefing" },
        source: "client",
      })
    );
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("defaults source to client when omitted", async () => {
    mockInsert.mockResolvedValue(mockInsertedEvent() as never);

    await recordBetaAnalyticsEvent({
      workspaceId: "ws-1",
      userId: "user-1",
      eventKey: "cockpit_stage_entered",
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ source: "client" })
    );
  });

  it("passes source server when caller specifies it", async () => {
    mockInsert.mockResolvedValue(
      mockInsertedEvent({ source: "server" }) as never
    );

    await recordBetaAnalyticsEvent({
      workspaceId: "ws-1",
      userId: "user-1",
      eventKey: "cockpit_stage_entered",
      source: "server",
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ source: "server" })
    );
  });

  it("validates session belongs to workspace before insert", async () => {
    mockGetSession.mockResolvedValue({
      id: SESSION_ID,
      workspaceId: "ws-1",
      assistanceLevel: "guided",
      startedAt: new Date(),
      endedAt: null,
      cohortLabel: null,
      operatorNotes: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockInsert.mockResolvedValue(
      mockInsertedEvent({ sessionId: SESSION_ID }) as never
    );

    await recordBetaAnalyticsEvent({
      workspaceId: "ws-1",
      userId: "user-1",
      eventKey: "cockpit_stage_entered",
      sessionId: SESSION_ID,
    });

    expect(mockGetSession).toHaveBeenCalledWith("ws-1", SESSION_ID);
    expect(mockInsert).toHaveBeenCalled();
  });

  it("rejects cross-workspace or missing session", async () => {
    mockGetSession.mockResolvedValue(null);

    await expect(
      recordBetaAnalyticsEvent({
        workspaceId: "ws-1",
        userId: "user-1",
        eventKey: "cockpit_stage_entered",
        sessionId: SESSION_ID,
      })
    ).rejects.toThrow(BetaEventPropertiesValidationError);

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("propagates sanitization errors for disallowed properties", async () => {
    await expect(
      recordBetaAnalyticsEvent({
        workspaceId: "ws-1",
        userId: "user-1",
        eventKey: "cockpit_stage_entered",
        properties: { prompt: "secret" },
      })
    ).rejects.toThrow(BetaEventPropertiesValidationError);

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("validates campaign ownership before insert", async () => {
    mockValidateCampaign.mockRejectedValue(
      new FeedbackValidationError(
        "Campaign not found in workspace",
        "invalid_campaign"
      )
    );

    await expect(
      recordBetaAnalyticsEvent({
        workspaceId: "ws-1",
        userId: "user-1",
        eventKey: "cockpit_stage_entered",
        campaignId: CAMPAIGN_ID,
      })
    ).rejects.toThrow(FeedbackValidationError);

    expect(mockValidateCampaign).toHaveBeenCalledWith("ws-1", CAMPAIGN_ID);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("validates derivation ownership when derivationId provided", async () => {
    const derivationId = "550e8400-e29b-41d4-a716-446655440002";
    mockValidateCampaign.mockResolvedValue(undefined);
    mockValidateDerivation.mockResolvedValue(undefined);
    mockInsert.mockResolvedValue(
      mockInsertedEvent({ campaignId: CAMPAIGN_ID, derivationId }) as never
    );

    await recordBetaAnalyticsEvent({
      workspaceId: "ws-1",
      userId: "user-1",
      eventKey: "mission_completed",
      campaignId: CAMPAIGN_ID,
      derivationId,
    });

    expect(mockValidateDerivation).toHaveBeenCalledWith(
      "ws-1",
      derivationId,
      CAMPAIGN_ID
    );
    expect(mockInsert).toHaveBeenCalled();
  });

  it.each(PHASE_76_BETA_EVENT_KEYS)(
    "accepts allowed Phase 76 event_key %s",
    async (eventKey) => {
      mockInsert.mockResolvedValue(mockInsertedEvent({ eventKey }) as never);

      await recordBetaAnalyticsEvent({
        workspaceId: "ws-1",
        userId: "user-1",
        eventKey,
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ eventKey })
      );
    }
  );

  it.each(PHASE_126_BETA_EVENT_KEYS)(
    "accepts allowed Phase 126 event_key %s",
    async (eventKey) => {
      mockInsert.mockResolvedValue(mockInsertedEvent({ eventKey }) as never);

      await recordBetaAnalyticsEvent({
        workspaceId: "ws-1",
        userId: "user-1",
        eventKey,
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ eventKey })
      );
    }
  );

  it("persists output_learning_recommendation_accepted with card payload unchanged", async () => {
    const properties = {
      recommendationId: "rec-1",
      variableKey: "cta",
      confidence: "high",
      recipeId: "performance_push",
      action: "accept",
      traceId: "ol-trace-1",
      evidenceEventCount: 2,
      blockedFieldCount: 1,
    };
    mockInsert.mockResolvedValue(
      mockInsertedEvent({
        eventKey: "output_learning_recommendation_accepted",
        properties,
      }) as never
    );

    await recordBetaAnalyticsEvent({
      workspaceId: "ws-1",
      userId: "user-1",
      eventKey: "output_learning_recommendation_accepted",
      properties,
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "output_learning_recommendation_accepted",
        properties,
      })
    );
  });

  it("rejects unknown event_key before insert", async () => {
    await expect(
      recordBetaAnalyticsEvent({
        workspaceId: "ws-1",
        userId: "user-1",
        eventKey: "stage_entered",
        properties: { stage: "briefing" },
      })
    ).rejects.toThrow(BetaEventPropertiesValidationError);

    expect(mockInsert).not.toHaveBeenCalled();
  });
});
