import { describe, it, expect } from "vitest";
import {
  BETA_RUNBOOK_STAGES,
  assistanceLevelSchema,
  mergeStageNotesSchema,
  stageNoteSchema,
} from "./types";

describe("beta-sessions types", () => {
  it("defines nine runbook stages from CONTEXT", () => {
    expect(BETA_RUNBOOK_STAGES).toHaveLength(9);
    expect(BETA_RUNBOOK_STAGES).toContain("setup");
    expect(BETA_RUNBOOK_STAGES).toContain("share");
  });

  it("assistanceLevelSchema accepts hands_on and observe_only only", () => {
    expect(assistanceLevelSchema.parse("hands_on")).toBe("hands_on");
    expect(assistanceLevelSchema.parse("observe_only")).toBe("observe_only");
    expect(() => assistanceLevelSchema.parse("guided")).toThrow();
  });

  it("stageNoteSchema accepts extended note fields", () => {
    const note = stageNoteSchema.parse({
      notes: "Blocked on credits",
      tags: ["credit surprise"],
      completedAt: "2026-06-07T12:00:00.000Z",
      blockerIds: ["insufficient-credits"],
      feedbackReportId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(note.blockerIds).toEqual(["insufficient-credits"]);
    expect(note.feedbackReportId).toBeDefined();
  });

  it("mergeStageNotesSchema rejects unknown stage keys", () => {
    expect(() =>
      mergeStageNotesSchema.parse({
        stages: { unknown_stage: { notes: "x" } },
      })
    ).toThrow();
  });
});
