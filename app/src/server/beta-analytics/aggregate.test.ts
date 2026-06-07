import { describe, expect, it } from "vitest";
import {
  aggregateCockpitStageFunnel,
  aggregateCreditSurprises,
  aggregateCreditSurprisesByOperation,
  aggregateMissionFunnel,
  aggregateReadinessOverrides,
  aggregateSessionStageTimeline,
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

  it("builds full funnel summary with totals", () => {
    const summary = buildAnalyticsFunnelSummary(ANALYTICS_FIXTURE_EVENTS);

    expect(summary.totals.events).toBe(ANALYTICS_FIXTURE_EVENTS.length);
    expect(summary.missionFunnel.length).toBeGreaterThan(0);
    expect(summary.cockpitStageFunnel.length).toBeGreaterThan(0);
  });

  it("exports events as CSV rows", () => {
    const csv = eventsToCsvRows(ANALYTICS_FIXTURE_EVENTS.slice(0, 1));
    const lines = csv.split("\n");

    expect(lines[0]).toContain("event_key");
    expect(lines[1]).toContain("cockpit_stage_entered");
  });
});
