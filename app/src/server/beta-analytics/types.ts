import { z } from "zod";

export const ALLOWED_PROPERTY_KEYS = [
  "stage",
  "missionKey",
  "source",
  "blockingCount",
  "estimateCredits",
  "actualCredits",
  "action",
  "operation",
  "operation_key",
  "creditDelta",
  "format",
  "isPreview",
  "readinessStatus",
  "durationMs",
  "reasonCode",
  "recipeId",
  "stepId",
  "tokenId",
  "blockingDimensions",
  "recommendationId",
  "variableKey",
  "confidence",
  "learningCount",
] as const;

export type AllowedPropertyKey = (typeof ALLOWED_PROPERTY_KEYS)[number];

export type BetaEventSource = "client" | "server";

export const PHASE_76_BETA_EVENT_KEYS = [
  "readiness_blocked",
  "readiness_completed",
  "credit_spend",
  "credit_blocked",
  "mission_completed",
  "cockpit_stage_entered",
  "cockpit_stage_completed",
  "cockpit_stage_abandoned",
  "recipe_selected",
  "recipe_tradeoff_viewed",
  "share_link_opened",
  "approval_package_refreshed",
] as const;

export const PHASE_107_BETA_EVENT_KEYS = [
  "next_experiment_viewed",
  "next_experiment_accepted",
  "next_experiment_edited",
  "next_experiment_dismissed",
] as const;

export const PHASE_121_BETA_EVENT_KEYS = [
  "derivation_auto_retry_triggered",
  "derivation_auto_retry_succeeded",
  "derivation_auto_retry_unchanged",
] as const;

export const BETA_EVENT_KEYS = [
  ...PHASE_76_BETA_EVENT_KEYS,
  ...PHASE_107_BETA_EVENT_KEYS,
  ...PHASE_121_BETA_EVENT_KEYS,
] as const;

export type Phase76BetaEventKey = (typeof PHASE_76_BETA_EVENT_KEYS)[number];
export type Phase107BetaEventKey = (typeof PHASE_107_BETA_EVENT_KEYS)[number];
export type Phase121BetaEventKey = (typeof PHASE_121_BETA_EVENT_KEYS)[number];
export type BetaEventKey = (typeof BETA_EVENT_KEYS)[number];

const EVENT_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

export const createBetaEventBodySchema = z.object({
  eventKey: z
    .string()
    .min(1)
    .max(64)
    .regex(EVENT_KEY_PATTERN, "eventKey must be snake_case"),
  sessionId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  derivationId: z.string().uuid().optional(),
  properties: z.record(z.unknown()).optional().default({}),
});

export type CreateBetaEventBody = z.infer<typeof createBetaEventBodySchema>;
