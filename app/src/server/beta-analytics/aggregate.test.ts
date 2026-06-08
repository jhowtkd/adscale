import { describe, expect, it } from "vitest";
import {
  aggregateCockpitStageFunnel,
  aggregateCreditSpendByStage,
  aggregateCreditSurprises,
  aggregateCreditSurprisesByOperation,
  aggregateDraftToShareTiming,
  aggregateGuidedBriefingAbandonByStep,
  aggregateMissionFunnel,
  aggregatePostPreviewStalls,
  aggregateReadinessOverrideByDimension,
  aggregateRecipeFunnel,
  aggregateReadinessOverrides,
  aggregateSessionStageTimeline,
  aggregateShareEngagementByAssistance,
  aggregateShareLinkOpens,
  buildAnalyticsFunnelSummary,
  eventsToCsvRows,
} from "./aggregate";
import { ANALYTICS_FIXTURE_EVENTS } from "./aggregate.fixture";
import { EXAMPLE_BETA_SESSION_FIXTURE } from "../repositories/beta-sessions.fixture";

describe("beta analytics aggregate", () => {
  it("computes mission conversion funnel per missionKey", () => {
    const funnel = aggregateMissionFunnel(ANALYTICS_FIXTURE_EVENTS);

    const readiness = funnel.find((row) => row.missionKey === "readiness");
    expect(readiness).toEqual({
      missionKey: "readiness",
      entered: 1,
      completed: 0,
      conversionRate: 0,
    });

    const exportMission = funnel.find((row) => row.missionKey === "export");
    expect(exportMission).toEqual({
      missionKey: "export",
      entered: 0,
      completed: 1,
      conversionRate: null,
    });
  });

  it("computes cockpit stage funnel with entered/completed/abandoned", () => {
    const funnel = aggregateCockpitStageFunnel(ANALYTICS_FIXTURE_EVENTS);
    const preview = funnel.find((row) => row.stage === "preview");

    expect(preview).toEqual({
      stage: "preview",
      entered: 1,
      completed: 0,
      abandoned: 1,
    });
  });

  it("flags credit surprises when estimate diverges from actual", () => {
    const surprises = aggregateCreditSurprises(ANALYTICS_FIXTURE_EVENTS);

    expect(surprises).toHaveLength(1);
    expect(surprises[0]).toMatchObject({
      operation: "preview", // from operation_key
      estimateCredits: 5,
      actualCredits: 8,
      delta: 3,
    });
  });

  it("ranks credit surprises by operation", () => {
    const ranked = aggregateCreditSurprisesByOperation(ANALYTICS_FIXTURE_EVENTS);

    expect(ranked).toEqual([
      {
        operation: "preview",
        surpriseCount: 1,
        totalDelta: 3,
        maxAbsDelta: 3,
      },
    ]);
  });

  it("builds session stage timeline with gaps from cockpit_stage_completed", () => {
    const timeline = aggregateSessionStageTimeline(ANALYTICS_FIXTURE_EVENTS);

    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline[0]).toMatchObject({
      gapFromPreviousMs: null,
    });
  });

  it("merges readiness_blocked events and operator false-positive notes", () => {
    const session = {
      id: EXAMPLE_BETA_SESSION_FIXTURE.sessionId,
      workspaceId: EXAMPLE_BETA_SESSION_FIXTURE.workspaceId,
      cohortLabel: EXAMPLE_BETA_SESSION_FIXTURE.cohortLabel,
      assistanceLevel: EXAMPLE_BETA_SESSION_FIXTURE.assistanceLevel,
      startedAt: new Date(EXAMPLE_BETA_SESSION_FIXTURE.startedAt),
      endedAt: new Date(EXAMPLE_BETA_SESSION_FIXTURE.endedAt!),
      operatorNotes: EXAMPLE_BETA_SESSION_FIXTURE.operatorNotes,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const overrides = aggregateReadinessOverrides(ANALYTICS_FIXTURE_EVENTS, [session]);

    expect(overrides.some((row) => row.kind === "event")).toBe(true);
    expect(overrides.some((row) => row.kind === "operator_note")).toBe(true);
    expect(
      overrides.find((row) => row.kind === "operator_note")?.tags
    ).toContain("blocking false positive");
  });

  it("aggregates recipe funnel by recipeId", () => {
    const events = [
      {
        ...ANALYTICS_FIXTURE_EVENTS[0]!,
        eventKey: "recipe_tradeoff_viewed",
        properties: { stage: "strategy_recipe", recipeId: "safe_iteration" },
      },
      {
        ...ANALYTICS_FIXTURE_EVENTS[0]!,
        id: "evt-recipe-selected",
        eventKey: "recipe_selected",
        properties: { stage: "strategy_recipe", recipeId: "safe_iteration" },
      },
    ];

    expect(aggregateRecipeFunnel(events)).toEqual([
      { recipeId: "safe_iteration", viewedCount: 1, selectedCount: 1 },
    ]);
  });

  it("aggregates guided briefing abandon rows by stepId", () => {
    const events = [
      {
        ...ANALYTICS_FIXTURE_EVENTS[0]!,
        eventKey: "cockpit_stage_abandoned",
        properties: {
          stage: "guided_briefing",
          missionKey: "guided_briefing",
          stepId: "productOffer",
        },
      },
    ];

    expect(aggregateGuidedBriefingAbandonByStep(events)).toEqual([
      { stepId: "productOffer", abandonCount: 1 },
    ]);
  });

  it("aggregates credit spend by cockpit stage", () => {
    const rows = aggregateCreditSpendByStage(ANALYTICS_FIXTURE_EVENTS);
    expect(rows.some((row) => row.stage === "preview" && row.totalCredits > 0)).toBe(true);
  });

  it("aggregates share link opens by campaign", () => {
    const campaignId = "550e8400-e29b-41d4-a716-446655440099";
    const events = [
      {
        ...ANALYTICS_FIXTURE_EVENTS[0]!,
        eventKey: "share_link_opened",
        campaignId,
        sessionId: null,
        properties: { tokenId: "abcd1234", stage: "share", missionKey: "share" },
      },
    ];

    expect(aggregateShareLinkOpens(events)).toEqual([
      { campaignId, openCount: 1 },
    ]);
  });

  it("aggregates readiness override dimensions from comma-separated property", () => {
    const events = [
      {
        ...ANALYTICS_FIXTURE_EVENTS[0]!,
        eventKey: "readiness_blocked",
        properties: {
          stage: "readiness",
          missionKey: "readiness",
          action: "overridden",
          blockingDimensions: "offerClarity,ctaProminence",
        },
      },
    ];

    expect(aggregateReadinessOverrideByDimension(events)).toEqual([
      { dimensionId: "ctaProminence", overrideCount: 1 },
      { dimensionId: "offerClarity", overrideCount: 1 },
    ]);
  });

  it("detects post-preview stall when batch credit spend is delayed", () => {
    const sessionId = EXAMPLE_BETA_SESSION_FIXTURE.sessionId;
    const base = ANALYTICS_FIXTURE_EVENTS[0]!;
    const events = [
      {
        ...base,
        sessionId,
        eventKey: "cockpit_stage_completed",
        createdAt: new Date("2026-06-07T14:00:00.000Z"),
        properties: { stage: "preview", missionKey: "preview" },
      },
      {
        ...base,
        id: "evt-batch-spend",
        sessionId,
        eventKey: "credit_spend",
        createdAt: new Date("2026-06-07T14:20:00.000Z"),
        properties: { operation_key: "batch", actualCredits: 50, stage: "batch" },
      },
    ];

    const summary = aggregatePostPreviewStalls(events);
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0]?.outcome).toBe("proceed");
    expect(summary.medianStallMs).toBe(20 * 60 * 1000);
  });

  it("computes draft-to-share median by assistance level", () => {
    const session = {
      id: EXAMPLE_BETA_SESSION_FIXTURE.sessionId,
      workspaceId: EXAMPLE_BETA_SESSION_FIXTURE.workspaceId,
      cohortLabel: EXAMPLE_BETA_SESSION_FIXTURE.cohortLabel,
      assistanceLevel: EXAMPLE_BETA_SESSION_FIXTURE.assistanceLevel,
      startedAt: new Date(EXAMPLE_BETA_SESSION_FIXTURE.startedAt),
      endedAt: new Date(EXAMPLE_BETA_SESSION_FIXTURE.endedAt!),
      operatorNotes: EXAMPLE_BETA_SESSION_FIXTURE.operatorNotes,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const base = ANALYTICS_FIXTURE_EVENTS[0]!;
    const events = [
      {
        ...base,
        eventKey: "cockpit_stage_entered",
        createdAt: new Date("2026-06-07T14:00:00.000Z"),
        properties: { stage: "guided_briefing", missionKey: "guided_briefing" },
      },
      {
        ...base,
        id: "evt-share-complete",
        eventKey: "mission_completed",
        createdAt: new Date("2026-06-07T15:30:00.000Z"),
        properties: { missionKey: "share", stage: "share" },
      },
    ];

    const timing = aggregateDraftToShareTiming(events, [session]);
    expect(timing.overallMedianMs).toBe(90 * 60 * 1000);
    expect(timing.byAssistanceLevel[0]?.assistanceLevel).toBe("hands_on");
  });

  it("correlates share opens with assistance level", () => {
    const session = {
      id: EXAMPLE_BETA_SESSION_FIXTURE.sessionId,
      workspaceId: EXAMPLE_BETA_SESSION_FIXTURE.workspaceId,
      cohortLabel: EXAMPLE_BETA_SESSION_FIXTURE.cohortLabel,
      assistanceLevel: "observe_only",
      startedAt: new Date(EXAMPLE_BETA_SESSION_FIXTURE.startedAt),
      endedAt: new Date(EXAMPLE_BETA_SESSION_FIXTURE.endedAt!),
      operatorNotes: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const campaignId = "550e8400-e29b-41d4-a716-446655440099";
    const base = ANALYTICS_FIXTURE_EVENTS[0]!;
    const events = [
      {
        ...base,
        sessionId: session.id,
        eventKey: "mission_completed",
        campaignId,
        properties: { missionKey: "share", stage: "share" },
      },
      {
        ...base,
        id: "evt-share-open",
        sessionId: null,
        eventKey: "share_link_opened",
        campaignId,
        properties: { tokenId: "abcd1234" },
      },
    ];

    const rows = aggregateShareEngagementByAssistance(events, [session]);
    expect(rows).toEqual([
      {
        assistanceLevel: "observe_only",
        sessionsWithShareCreated: 1,
        sessionsWithShareOpened: 1,
        openRate: 1,
      },
    ]);
  });

  it("builds full funnel summary with totals", () => {
    const summary = buildAnalyticsFunnelSummary(ANALYTICS_FIXTURE_EVENTS);

    expect(summary.totals.events).toBe(ANALYTICS_FIXTURE_EVENTS.length);
    expect(summary.missionFunnel.length).toBeGreaterThan(0);
    expect(summary.cockpitStageFunnel.length).toBeGreaterThan(0);
    expect(summary.recipeFunnel).toEqual([]);
    expect(summary.guidedBriefingAbandonByStep).toEqual([]);
    expect(summary.creditSpendByStage.length).toBeGreaterThan(0);
    expect(summary.shareLinkOpens).toEqual([]);
    expect(summary.postPreviewStall.rows).toEqual([]);
  });

  it("exports events as CSV rows", () => {
    const csv = eventsToCsvRows(ANALYTICS_FIXTURE_EVENTS.slice(0, 1));
    const lines = csv.split("\n");

    expect(lines[0]).toContain("event_key");
    expect(lines[1]).toContain("cockpit_stage_entered");
  });
});
