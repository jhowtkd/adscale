import { describe, it, expect, vi, beforeEach } from "vitest";
import { BetaEventPropertiesValidationError } from "./sanitize";

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

const WORKSPACE_ID = "ws-1";
const USER_ID = "user-1";
const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440001";

function mockInsertedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    workspaceId: WORKSPACE_ID,
    userId: USER_ID,
    sessionId: null,
    eventKey: "cockpit_stage_entered",
    properties: {},
    source: "client",
    campaignId: null,
    derivationId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("QA-01 instrumentation integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateCampaign.mockResolvedValue(undefined);
    mockValidateDerivation.mockResolvedValue(undefined);
  });

  describe("readiness block path", () => {
    it("records readiness_blocked through recordBetaAnalyticsEvent with server source", async () => {
      mockInsert.mockResolvedValue(
        mockInsertedEvent({
          eventKey: "readiness_blocked",
          source: "server",
          properties: {
            stage: "readiness",
            missionKey: "readiness",
            blockingCount: 2,
            readinessStatus: "blocked",
          },
        }) as never
      );

      await recordBetaAnalyticsEvent({
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        eventKey: "readiness_blocked",
        source: "server",
        properties: {
          stage: "readiness",
          missionKey: "readiness",
          blockingCount: 2,
          readinessStatus: "blocked",
        },
      });

      expect(mockInsert).toHaveBeenCalledTimes(1);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          eventKey: "readiness_blocked",
          source: "server",
          properties: {
            stage: "readiness",
            missionKey: "readiness",
            blockingCount: 2,
            readinessStatus: "blocked",
          },
        })
      );
    });
  });

  describe("readiness complete path", () => {
    it("records readiness_completed with blockingCount 0 and ready status", async () => {
      mockInsert.mockResolvedValue(
        mockInsertedEvent({
          eventKey: "readiness_completed",
          source: "server",
          properties: {
            stage: "readiness",
            missionKey: "readiness",
            blockingCount: 0,
            readinessStatus: "ready",
          },
        }) as never
      );

      await recordBetaAnalyticsEvent({
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        eventKey: "readiness_completed",
        source: "server",
        properties: {
          stage: "readiness",
          missionKey: "readiness",
          blockingCount: 0,
          readinessStatus: "ready",
        },
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          eventKey: "readiness_completed",
          source: "server",
          properties: expect.objectContaining({
            blockingCount: 0,
            readinessStatus: "ready",
          }),
        })
      );
    });
  });

  it("rejects unknown event_key before insert (regression guard)", async () => {
    await expect(
      recordBetaAnalyticsEvent({
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        eventKey: "stage_entered",
        properties: { stage: "readiness" },
      })
    ).rejects.toThrow(BetaEventPropertiesValidationError);

    expect(mockInsert).not.toHaveBeenCalled();
  });

  describe("mission completion — export path", () => {
    it("records mission_completed export scenario with server source", async () => {
      mockInsert.mockResolvedValue(
        mockInsertedEvent({
          eventKey: "mission_completed",
          source: "server",
          campaignId: CAMPAIGN_ID,
          properties: {
            missionKey: "export",
            stage: "export",
            operation: "individual",
          },
        }) as never
      );

      await recordBetaAnalyticsEvent({
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        eventKey: "mission_completed",
        source: "server",
        campaignId: CAMPAIGN_ID,
        properties: {
          missionKey: "export",
          stage: "export",
          operation: "individual",
        },
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          eventKey: "mission_completed",
          source: "server",
          campaignId: CAMPAIGN_ID,
          properties: {
            missionKey: "export",
            stage: "export",
            operation: "individual",
          },
        })
      );
    });
  });

  describe("mission completion — share path", () => {
    it("records mission_completed share scenario", async () => {
      mockInsert.mockResolvedValue(
        mockInsertedEvent({
          eventKey: "mission_completed",
          source: "server",
          campaignId: CAMPAIGN_ID,
          properties: {
            missionKey: "share",
            stage: "share",
          },
        }) as never
      );

      await recordBetaAnalyticsEvent({
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        eventKey: "mission_completed",
        source: "server",
        campaignId: CAMPAIGN_ID,
        properties: {
          missionKey: "share",
          stage: "share",
        },
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          eventKey: "mission_completed",
          properties: expect.objectContaining({ missionKey: "share" }),
        })
      );
    });
  });

  describe("client cockpit stage complete path", () => {
    it("records cockpit_stage_completed preview with default client source", async () => {
      mockInsert.mockResolvedValue(
        mockInsertedEvent({
          eventKey: "cockpit_stage_completed",
          source: "client",
          properties: {
            stage: "preview",
            missionKey: "preview",
          },
        }) as never
      );

      await recordBetaAnalyticsEvent({
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        eventKey: "cockpit_stage_completed",
        properties: {
          stage: "preview",
          missionKey: "preview",
        },
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          eventKey: "cockpit_stage_completed",
          source: "client",
          properties: {
            stage: "preview",
            missionKey: "preview",
          },
        })
      );
    });
  });
});

describe("INST-04 smoke — events attach session_id when beta_sessions fixture exists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateCampaign.mockResolvedValue(undefined);
    mockValidateDerivation.mockResolvedValue(undefined);
  });

  it("attaches sessionId on client path when beta_sessions fixture exists", async () => {
    mockGetSession.mockResolvedValue({
      id: SESSION_ID,
      workspaceId: WORKSPACE_ID,
      assistanceLevel: "guided",
      startedAt: new Date(),
      endedAt: null,
      cohortLabel: null,
      operatorNotes: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockInsert.mockResolvedValue(
      mockInsertedEvent({
        sessionId: SESSION_ID,
        eventKey: "cockpit_stage_entered",
      }) as never
    );

    await recordBetaAnalyticsEvent({
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      eventKey: "cockpit_stage_entered",
      sessionId: SESSION_ID,
    });

    expect(mockGetSession).toHaveBeenCalledWith(WORKSPACE_ID, SESSION_ID);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION_ID })
    );
  });

  it("rejects cross-workspace sessionId before insert", async () => {
    mockGetSession.mockResolvedValue(null);

    await expect(
      recordBetaAnalyticsEvent({
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        eventKey: "cockpit_stage_entered",
        sessionId: SESSION_ID,
      })
    ).rejects.toThrow(BetaEventPropertiesValidationError);

    expect(mockInsert).not.toHaveBeenCalled();
  });
});
