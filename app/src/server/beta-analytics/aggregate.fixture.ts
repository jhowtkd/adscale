import type { BetaAnalyticsEvent } from "../db/schema";
import { EXAMPLE_BETA_SESSION_FIXTURE } from "../repositories/beta-sessions.fixture";

const { sessionId, workspaceId } = EXAMPLE_BETA_SESSION_FIXTURE;

function event(
  overrides: Partial<BetaAnalyticsEvent> & Pick<BetaAnalyticsEvent, "eventKey">
): BetaAnalyticsEvent {
  return {
    id: crypto.randomUUID(),
    workspaceId,
    userId: "user-1",
    sessionId,
    properties: {},
    source: "client",
    campaignId: null,
    derivationId: null,
    createdAt: new Date("2026-06-07T14:00:00.000Z"),
    ...overrides,
  };
}

/** Fixture events covering mission funnel, cockpit stages, credit surprise, readiness block. */
export const ANALYTICS_FIXTURE_EVENTS: BetaAnalyticsEvent[] = [
  event({
    id: "evt-readiness-enter",
    eventKey: "cockpit_stage_entered",
    properties: { stage: "readiness", missionKey: "readiness" },
    createdAt: new Date("2026-06-07T14:10:00.000Z"),
  }),
  event({
    id: "evt-readiness-block",
    eventKey: "readiness_blocked",
    properties: {
      stage: "readiness",
      missionKey: "readiness",
      blockingCount: 2,
      readinessStatus: "blocked",
    },
    createdAt: new Date("2026-06-07T14:11:00.000Z"),
  }),
  event({
    id: "evt-readiness-complete",
    eventKey: "cockpit_stage_completed",
    properties: { stage: "readiness", missionKey: "readiness" },
    createdAt: new Date("2026-06-07T14:15:00.000Z"),
  }),
  event({
    id: "evt-briefing-enter",
    eventKey: "cockpit_stage_entered",
    properties: { stage: "guided_briefing", missionKey: "guided_briefing" },
    createdAt: new Date("2026-06-07T14:20:00.000Z"),
  }),
  event({
    id: "evt-briefing-complete",
    eventKey: "cockpit_stage_completed",
    properties: { stage: "guided_briefing", missionKey: "guided_briefing" },
    createdAt: new Date("2026-06-07T14:25:00.000Z"),
  }),
  event({
    id: "evt-preview-enter",
    eventKey: "cockpit_stage_entered",
    properties: { stage: "preview", missionKey: "preview" },
    createdAt: new Date("2026-06-07T14:40:00.000Z"),
  }),
  event({
    id: "evt-preview-abandon",
    eventKey: "cockpit_stage_abandoned",
    properties: { stage: "preview", missionKey: "preview" },
    createdAt: new Date("2026-06-07T14:42:00.000Z"),
  }),
  event({
    id: "evt-credit-spend",
    eventKey: "credit_spend",
    source: "server",
    properties: {
      operation: "preview",
      estimateCredits: 5,
      actualCredits: 8,
    },
    createdAt: new Date("2026-06-07T14:43:00.000Z"),
  }),
  event({
    id: "evt-credit-block",
    eventKey: "credit_blocked",
    source: "server",
    properties: { operation: "batch", estimateCredits: 50 },
    createdAt: new Date("2026-06-07T14:50:00.000Z"),
  }),
  event({
    id: "evt-mission-export",
    eventKey: "mission_completed",
    source: "server",
    properties: { missionKey: "export" },
    createdAt: new Date("2026-06-07T15:20:00.000Z"),
  }),
  event({
    id: "evt-mission-share",
    eventKey: "mission_completed",
    source: "server",
    properties: { missionKey: "share" },
    createdAt: new Date("2026-06-07T15:30:00.000Z"),
  }),
];
