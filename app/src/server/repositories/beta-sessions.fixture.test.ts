import { describe, it, expect } from "vitest";
import { BETA_RUNBOOK_STAGES } from "../beta-sessions/types";
import {
  EXAMPLE_BETA_SESSION_FIXTURE,
  buildExampleSessionSummary,
} from "./beta-sessions.fixture";

describe("EXAMPLE_BETA_SESSION_FIXTURE", () => {
  it("covers happy-path runbook stages", () => {
    const completedStages = Object.keys(EXAMPLE_BETA_SESSION_FIXTURE.operatorNotes);
    for (const stage of BETA_RUNBOOK_STAGES) {
      expect(completedStages).toContain(stage);
    }
  });

  it("buildExampleSessionSummary matches fixture metadata", () => {
    const summary = buildExampleSessionSummary();

    expect(summary.sessionId).toBe(EXAMPLE_BETA_SESSION_FIXTURE.sessionId);
    expect(summary.workspaceId).toBe(EXAMPLE_BETA_SESSION_FIXTURE.workspaceId);
    expect(summary.stagesCompleted).toHaveLength(BETA_RUNBOOK_STAGES.length);
    expect(summary.eventIds).toEqual(EXAMPLE_BETA_SESSION_FIXTURE.eventIds);
    expect(summary.feedbackReportIds).toContain(
      "550e8400-e29b-41d4-a716-446655440099"
    );
  });
});
