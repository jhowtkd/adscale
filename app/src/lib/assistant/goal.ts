import { z } from "zod";

export const GOAL_BASE_FORMAT = "1:1" as const;
export const GOAL_FORMATS = ["1:1", "4:5", "9:16", "16:9"] as const;
export const GOAL_CREATIVE_LEVELS = [
  "conservative",
  "balanced",
  "bold",
] as const;

export const goalStageSchema = z.enum([
  "intake",
  "planning",
  "awaiting_generation",
  "generating_variants",
  "choosing_base",
  "reviewing_base",
  "awaiting_package",
  "generating_package",
  "reviewing_package",
  "completed",
  "stopped",
  "failed",
]);
export type GoalStage = z.infer<typeof goalStageSchema>;

export const goalBriefSchema = z
  .object({
    productOffer: z.string().trim().max(2_000).default(""),
    audience: z.string().trim().max(2_000).default(""),
    constraints: z.string().trim().max(2_000).default(""),
    objective: z.string().trim().max(2_000).default(""),
    cta: z.string().trim().max(500).default(""),
    referenceIds: z.array(z.string().uuid()).max(20).default([]),
    baseAssetId: z.string().uuid().nullable().default(null),
  })
  .strict();
export type GoalBrief = z.infer<typeof goalBriefSchema>;

export const goalPlanSchema = z
  .object({
    strategy: z.string().trim().max(2_000).default(""),
    angles: z.array(z.string().trim().max(500)).max(20).default([]),
    hooks: z.array(z.string().trim().max(500)).max(20).default([]),
    ctas: z.array(z.string().trim().max(500)).max(20).default([]),
  })
  .strict();
export type GoalPlan = z.infer<typeof goalPlanSchema>;

export const goalAnnotationInputSchema = z
  .object({
    versionId: z.string().uuid(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
    comment: z.string().trim().min(1).max(1_000),
  })
  .refine(
    (r) => r.x + r.width <= 1 && r.y + r.height <= 1,
    "rectangle_out_of_bounds"
  );

export const goalPlanStepKeySchema = z.enum([
  "understand",
  "plan",
  "create",
  "review",
]);
export const goalPlanStepStatusSchema = z.enum([
  "pending",
  "active",
  "done",
  "blocked",
]);

export const goalCandidatePresentationSchema = z
  .object({
    versionId: z.string().uuid().nullable(),
    derivationId: z.string().uuid(),
    creativeLevel: z.enum(["conservative", "balanced", "bold"]),
    format: z.string(),
    status: z.enum(["running", "ready", "failed"]),
    previewUrl: z.string().url().nullable(),
  })
  .strict();

export const goalPackageItemPresentationSchema = z
  .object({
    format: z.string(),
    versionId: z.string().uuid().nullable(),
    status: z.enum(["pending", "running", "ready", "failed", "approved", "stale"]),
    previewUrl: z.string().url().nullable(),
  })
  .strict();

export const goalAnnotationPresentationSchema = z
  .object({
    id: z.string().uuid(),
    versionId: z.string().uuid(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    comment: z.string(),
    status: z.enum(["draft", "submitted", "addressed"]),
    addressedByVersionId: z.string().uuid().nullable(),
  })
  .strict();

/**
 * Strict, allowlisted projection of a goal run that is safe to send to the
 * client (chat context, SSE events, and the workspace projection).
 *
 * It deliberately forbids prompts, output keys, provider payloads, generation
 * logs, reasoning, and signed URLs outside the per-candidate ephemeral
 * `previewUrl`. Any change that adds a sensitive field here is a contract
 * violation.
 */
export const assistantGoalPresentationSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    stage: goalStageSchema,
    objective: z.string(),
    planSteps: z
      .array(
        z
          .object({
            key: goalPlanStepKeySchema,
            status: goalPlanStepStatusSchema,
          })
          .strict()
      )
      .max(4),
    assumptions: z.array(z.string()).max(20),
    blockers: z.array(z.string()).max(20),
    candidates: z.array(goalCandidatePresentationSchema).max(3),
    selectedBaseVersionId: z.string().uuid().nullable(),
    annotations: z.array(goalAnnotationPresentationSchema),
    packageItems: z.array(goalPackageItemPresentationSchema).max(4),
    approvedFormatCount: z.number().int().nonnegative(),
    requiredFormatCount: z.literal(4),
  })
  .strict();
export type AssistantGoalPresentation = z.infer<
  typeof assistantGoalPresentationSchema
>;
