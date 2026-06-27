import { z } from "zod";

export const GUIDED_FLOW_SCHEMA_VERSION = 2;

export const guidedFlowPathSchema = z.enum([
  "existing_creative",
  "from_zero",
  "unclassified",
]);

export const guidedJourneyPathSchema = z.enum(["existing_creative", "from_zero"]);

export const guidedCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("select_path"),
    path: guidedJourneyPathSchema,
  }),
  z.object({ type: z.literal("back") }),
  z.object({
    type: z.literal("switch_path"),
    path: guidedJourneyPathSchema,
  }),
  z.object({ type: z.literal("restart") }),
  z.object({
    type: z.literal("preview_switch"),
    path: guidedJourneyPathSchema,
  }),
  z.object({ type: z.literal("preview_restart") }),
  z.object({
    type: z.literal("edit_field"),
    field: z.string().min(1),
    value: z.string(),
  }),
  z.object({ type: z.literal("clear_error") }),
  z.object({
    type: z.literal("answer_brief"),
    field: z.string().min(1),
    value: z.string(),
    unknown: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("skip_brief_field"),
    field: z.string().min(1),
  }),
  z.object({ type: z.literal("confirm_brief_review") }),
  z.object({
    type: z.literal("correct_diagnosis_field"),
    field: z.string().min(1),
    value: z.string(),
  }),
  z.object({ type: z.literal("approve_diagnosis") }),
  z.object({
    type: z.literal("correct_diagnosis_assumption"),
    index: z.number().int().min(0),
    value: z.string().min(1),
  }),
  z.object({
    type: z.literal("select_creative"),
    workspaceAssetId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("set_references"),
    referenceIds: z.array(z.string().uuid()).min(3),
  }),
]);

export const guidedCommandEnvelopeSchema = z.object({
  commandId: z.string().min(1).max(128),
  expectedRevision: z.number().int().min(0),
  command: guidedCommandSchema,
});

export type GuidedCommand = z.infer<typeof guidedCommandSchema>;
export type GuidedCommandEnvelope = z.infer<typeof guidedCommandEnvelopeSchema>;

export interface RetentionPreview {
  retained: string[];
  cleared: string[];
}

export interface GuidedFlowPresentation {
  path: string;
  status: string;
  currentStep: string;
  revision: number;
  schemaVersion: number;
  missingFields: string[];
  assetIds: string[];
  referenceIds: string[];
  campaignId: string | null;
  recoverableError: Record<string, unknown> | null;
  slots: Record<string, unknown>;
  navigationHistory: string[];
  allowedCommands: GuidedCommand["type"][];
  retentionPreview?: RetentionPreview;
  prompt?: {
    field: string;
    labelKey: string;
    quickReplies?: string[];
    allowSkip?: boolean;
    allowUnknown?: boolean;
    suggestion?: { value: string; source: string } | null;
  };
  briefReview?: Record<string, string>;
  diagnosisReview?: {
    facts: string[];
    assumptions: string[];
    missingFields: string[];
    editable: boolean;
  };
}
