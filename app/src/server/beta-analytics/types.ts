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
  "format",
  "isPreview",
  "readinessStatus",
  "durationMs",
  "reasonCode",
] as const;

export type AllowedPropertyKey = (typeof ALLOWED_PROPERTY_KEYS)[number];

export type BetaEventSource = "client" | "server";

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
