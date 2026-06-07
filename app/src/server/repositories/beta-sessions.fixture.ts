import type { BetaOperatorNotes } from "../beta-sessions/types";
import type { BetaSessionSummary } from "./beta-sessions";

/** Documented happy-path example session for tests and operator reference (SESS-03/04). */
export const EXAMPLE_BETA_SESSION_FIXTURE = {
  sessionId: "550e8400-e29b-41d4-a716-446655440001",
  workspaceId: "550e8400-e29b-41d4-a716-446655440002",
  cohortLabel: "beta-operator-1",
  assistanceLevel: "hands_on" as const,
  startedAt: "2026-06-07T14:00:00.000Z",
  endedAt: "2026-06-07T15:30:00.000Z",
  operatorNotes: {
    setup: {
      notes: "Draft campaign created, one base creative uploaded",
      completedAt: "2026-06-07T14:05:00.000Z",
    },
    readiness: {
      notes: "Readiness passed after brief fix",
      tags: ["blocking false positive"],
      completedAt: "2026-06-07T14:15:00.000Z",
    },
    guided_briefing: {
      notes: "Answered two guided questions",
      completedAt: "2026-06-07T14:25:00.000Z",
    },
    strategy_recipe: {
      notes: "Selected Performance Push",
      completedAt: "2026-06-07T14:35:00.000Z",
    },
    preview: {
      notes: "Preview approved, credit line confirmed",
      completedAt: "2026-06-07T14:45:00.000Z",
    },
    batch: {
      notes: "Full batch queued",
      completedAt: "2026-06-07T15:00:00.000Z",
    },
    review: {
      notes: "Two winners marked",
      completedAt: "2026-06-07T15:10:00.000Z",
    },
    export: {
      notes: "Package exported",
      completedAt: "2026-06-07T15:20:00.000Z",
    },
    share: {
      notes: "Share link opened in incognito",
      completedAt: "2026-06-07T15:30:00.000Z",
      feedbackReportId: "550e8400-e29b-41d4-a716-446655440099",
    },
  } satisfies BetaOperatorNotes,
  eventIds: [
    "660e8400-e29b-41d4-a716-446655440010",
    "660e8400-e29b-41d4-a716-446655440011",
  ],
};

export function buildExampleSessionSummary(): BetaSessionSummary {
  const notes = EXAMPLE_BETA_SESSION_FIXTURE.operatorNotes;
  const stagesCompleted = Object.entries(notes)
    .filter(([, note]) => note.completedAt)
    .map(([stage, note]) => ({
      stage: stage as keyof typeof notes,
      completedAt: note.completedAt!,
    }));

  return {
    sessionId: EXAMPLE_BETA_SESSION_FIXTURE.sessionId,
    workspaceId: EXAMPLE_BETA_SESSION_FIXTURE.workspaceId,
    cohortLabel: EXAMPLE_BETA_SESSION_FIXTURE.cohortLabel,
    assistanceLevel: EXAMPLE_BETA_SESSION_FIXTURE.assistanceLevel,
    startedAt: EXAMPLE_BETA_SESSION_FIXTURE.startedAt,
    endedAt: EXAMPLE_BETA_SESSION_FIXTURE.endedAt,
    stagesCompleted,
    blockers: [],
    feedbackReportIds: ["550e8400-e29b-41d4-a716-446655440099"],
    eventIds: EXAMPLE_BETA_SESSION_FIXTURE.eventIds,
    operatorNotes: notes,
  };
}
