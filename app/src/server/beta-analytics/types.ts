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
] as const;

export type Phase76BetaEventKey = (typeof PHASE_76_BETA_EVENT_KEYS)[number];

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
