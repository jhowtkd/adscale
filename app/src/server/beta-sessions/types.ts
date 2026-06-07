import { z } from "zod";

/** Runbook stages from 67-BETA-RUNBOOK.md — keys for operator_notes jsonb. */
export const BETA_RUNBOOK_STAGES = [
  "setup",
  "readiness",
  "guided_briefing",
  "strategy_recipe",
  "preview",
  "batch",
  "review",
  "export",
  "share",
] as const;

export type BetaRunbookStage = (typeof BETA_RUNBOOK_STAGES)[number];

export const assistanceLevelSchema = z.enum(["hands_on", "observe_only"]);

export type BetaAssistanceLevel = z.infer<typeof assistanceLevelSchema>;

export const stageNoteSchema = z.object({
  notes: z.string().max(10000).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
  completedAt: z.string().datetime().optional(),
  blockerIds: z.array(z.string().max(200)).max(50).optional(),
  feedbackReportId: z.string().uuid().optional(),
});

export type BetaStageNote = z.infer<typeof stageNoteSchema>;

export type BetaOperatorNotes = Partial<Record<BetaRunbookStage, BetaStageNote>>;

export const betaRunbookStageSchema = z.enum(BETA_RUNBOOK_STAGES);

export const mergeStageNotesSchema = z.object({
  stages: z.record(betaRunbookStageSchema, stageNoteSchema),
});

export const startBetaSessionSchema = z.object({
  workspaceId: z.string().uuid(),
  cohortLabel: z.string().max(200).optional(),
  assistanceLevel: assistanceLevelSchema.optional().default("hands_on"),
});

export const endBetaSessionSchema = z.object({
  endedAt: z.string().datetime().optional(),
});
