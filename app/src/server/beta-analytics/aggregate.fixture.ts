import type { BetaAnalyticsEvent } from "../db/schema";
import type { StudioUsageEvent } from "./aggregate";
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
    idempotencyKey: null,
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
      operation: "image_derivation",
      operation_key: "preview",
      estimateCredits: 5,
      actualCredits: 8,
      creditDelta: 3,
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

const STUDIO_CONTROL_WORKSPACE = "11111111-1111-4111-8111-111111111111";
const STUDIO_PROGRESSIVE_WORKSPACE = "22222222-2222-4222-8222-222222222222";
const STUDIO_CONTROL_SESSION = "33333333-3333-4333-8333-333333333333";
const STUDIO_CONTROL_ABANDONED_SESSION = "44444444-4444-4444-8444-444444444444";
const STUDIO_PROGRESSIVE_SESSION = "55555555-5555-4555-8555-555555555555";
const STUDIO_CONTROL_WORK = "66666666-6666-4666-8666-666666666666";
const STUDIO_PROGRESSIVE_WORK = "77777777-7777-4777-8777-777777777777";

function studioEvent(
  id: string,
  eventKey: string,
  workspaceId: string,
  createdAt: string,
  properties: Record<string, unknown>,
  source: "client" | "server" = "client",
): BetaAnalyticsEvent {
  return {
    id,
    workspaceId,
    userId: "studio-user",
    sessionId: null,
    eventKey,
    properties,
    source,
    campaignId: null,
    derivationId: null,
    idempotencyKey: null,
    createdAt: new Date(createdAt),
  };
}

/** Studio rollout fixture: arm freeze, generation dedupe, 24-hour joins, and ledger correlation. */
export const STUDIO_ROLLOUT_FIXTURE_EVENTS: BetaAnalyticsEvent[] = [
  studioEvent("studio-control-entry", "studio_entry_started", STUDIO_CONTROL_WORKSPACE, "2026-07-01T23:50:00.000Z", { studioSessionId: STUDIO_CONTROL_SESSION, rolloutVariant: "control" }),
  studioEvent("studio-control-duplicate-entry", "studio_entry_started", STUDIO_CONTROL_WORKSPACE, "2026-07-01T23:51:00.000Z", { studioSessionId: STUDIO_CONTROL_SESSION, rolloutVariant: "progressive" }),
  studioEvent("studio-control-start", "creative_work_started", STUDIO_CONTROL_WORKSPACE, "2026-07-01T23:53:00.000Z", { studioSessionId: STUDIO_CONTROL_SESSION, creativeWorkId: STUDIO_CONTROL_WORK, inputMode: "text" }),
  studioEvent("studio-control-goal-first", "studio_goal_selected", STUDIO_CONTROL_WORKSPACE, "2026-07-01T23:54:00.000Z", { studioSessionId: STUDIO_CONTROL_SESSION }),
  studioEvent("studio-control-briefing", "briefing_ready", STUDIO_CONTROL_WORKSPACE, "2026-07-01T23:55:00.000Z", { studioSessionId: STUDIO_CONTROL_SESSION, creativeWorkId: STUDIO_CONTROL_WORK }),
  studioEvent("studio-control-goal-switch", "studio_goal_selected", STUDIO_CONTROL_WORKSPACE, "2026-07-01T23:56:00.000Z", { studioSessionId: STUDIO_CONTROL_SESSION }),
  studioEvent("studio-control-role", "studio_source_role_selected", STUDIO_CONTROL_WORKSPACE, "2026-07-01T23:57:00.000Z", { studioSessionId: STUDIO_CONTROL_SESSION, creativeWorkId: STUDIO_CONTROL_WORK, sourceRole: "style" }),
  studioEvent("studio-control-generation", "generation_confirmed", STUDIO_CONTROL_WORKSPACE, "2026-07-01T23:58:00.000Z", { studioSessionId: STUDIO_CONTROL_SESSION, creativeWorkId: STUDIO_CONTROL_WORK }, "server"),
  studioEvent("studio-control-generation-duplicate", "generation_confirmed", STUDIO_CONTROL_WORKSPACE, "2026-07-01T23:59:00.000Z", { studioSessionId: STUDIO_CONTROL_SESSION, creativeWorkId: STUDIO_CONTROL_WORK }, "server"),
  studioEvent("studio-control-output", "output_ready", STUDIO_CONTROL_WORKSPACE, "2026-07-02T00:10:00.000Z", { creativeWorkId: STUDIO_CONTROL_WORK }, "server"),
  studioEvent("studio-control-partial-failure", "creative_work_failed", STUDIO_CONTROL_WORKSPACE, "2026-07-02T00:12:00.000Z", { creativeWorkId: STUDIO_CONTROL_WORK }, "server"),
  studioEvent("studio-control-reopen-29", "creative_work_reopened", STUDIO_CONTROL_WORKSPACE, "2026-07-02T00:20:00.000Z", { studioSessionId: STUDIO_CONTROL_SESSION, creativeWorkId: STUDIO_CONTROL_WORK }),
  studioEvent("studio-control-reviewed", "creative_work_reviewed", STUDIO_CONTROL_WORKSPACE, "2026-07-02T00:49:00.000Z", { creativeWorkId: STUDIO_CONTROL_WORK }, "server"),
  studioEvent("studio-control-reopen-31", "creative_work_reopened", STUDIO_CONTROL_WORKSPACE, "2026-07-02T01:00:00.000Z", { studioSessionId: STUDIO_CONTROL_SESSION, creativeWorkId: STUDIO_CONTROL_WORK }),
  studioEvent("studio-control-approved", "creative_work_approved", STUDIO_CONTROL_WORKSPACE, "2026-07-02T01:31:00.000Z", { creativeWorkId: STUDIO_CONTROL_WORK }, "server"),
  studioEvent("studio-control-refinement", "studio_refinement_started", STUDIO_CONTROL_WORKSPACE, "2026-07-02T01:05:00.000Z", { studioSessionId: STUDIO_CONTROL_SESSION, creativeWorkId: STUDIO_CONTROL_WORK }),
  studioEvent("studio-control-abandoned-entry", "studio_entry_started", STUDIO_CONTROL_WORKSPACE, "2026-07-03T12:00:00.000Z", { studioSessionId: STUDIO_CONTROL_ABANDONED_SESSION, rolloutVariant: "control" }),
  studioEvent("studio-progressive-entry", "studio_entry_started", STUDIO_PROGRESSIVE_WORKSPACE, "2026-07-04T12:00:00.000Z", { studioSessionId: STUDIO_PROGRESSIVE_SESSION, rolloutVariant: "progressive" }),
  studioEvent("studio-progressive-start", "creative_work_started", STUDIO_PROGRESSIVE_WORKSPACE, "2026-07-04T12:01:00.000Z", { studioSessionId: STUDIO_PROGRESSIVE_SESSION, creativeWorkId: STUDIO_PROGRESSIVE_WORK, inputMode: "art" }),
  studioEvent("studio-progressive-briefing", "briefing_ready", STUDIO_PROGRESSIVE_WORKSPACE, "2026-07-04T12:02:00.000Z", { studioSessionId: STUDIO_PROGRESSIVE_SESSION, creativeWorkId: STUDIO_PROGRESSIVE_WORK }),
  studioEvent("studio-progressive-plan", "studio_plan_shown", STUDIO_PROGRESSIVE_WORKSPACE, "2026-07-04T12:05:00.000Z", { studioSessionId: STUDIO_PROGRESSIVE_SESSION, creativeWorkId: STUDIO_PROGRESSIVE_WORK }),
  studioEvent("studio-progressive-generation", "generation_confirmed", STUDIO_PROGRESSIVE_WORKSPACE, "2026-07-04T12:06:00.000Z", { studioSessionId: STUDIO_PROGRESSIVE_SESSION, creativeWorkId: STUDIO_PROGRESSIVE_WORK }, "server"),
  studioEvent("studio-progressive-all-failed", "creative_work_failed", STUDIO_PROGRESSIVE_WORKSPACE, "2026-07-04T12:10:00.000Z", { creativeWorkId: STUDIO_PROGRESSIVE_WORK }, "server"),
];

export const STUDIO_ROLLOUT_FIXTURE_USAGE: StudioUsageEvent[] = [
  { workspaceId: STUDIO_CONTROL_WORKSPACE, amount: 8, metadata: { creativeWorkId: STUDIO_CONTROL_WORK }, createdAt: new Date("2026-07-01T23:58:30.000Z") },
  { workspaceId: STUDIO_CONTROL_WORKSPACE, amount: -8, metadata: { creativeWorkId: STUDIO_CONTROL_WORK, refund: true, description: "creative_work_dispatch_refund" }, createdAt: new Date("2026-07-02T00:13:00.000Z") },
  { workspaceId: STUDIO_PROGRESSIVE_WORKSPACE, amount: 8, metadata: { creativeWorkId: STUDIO_PROGRESSIVE_WORK }, createdAt: new Date("2026-07-04T12:06:30.000Z") },
  { workspaceId: STUDIO_PROGRESSIVE_WORKSPACE, amount: -8, metadata: { creativeWorkId: STUDIO_PROGRESSIVE_WORK, refund: true, description: "creative_work_terminal_refund" }, createdAt: new Date("2026-07-04T12:11:00.000Z") },
];
