import { z } from "zod";

export const GUIDED_FLOW_SCHEMA_VERSION = 1;

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
}
