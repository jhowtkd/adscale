import { z } from "zod";
import { reviewOutputSchema } from "../agents/reviewers";

export const WORK_TASKS = {
  caption_revalidation: "review_caption",
  adjustment: "plan_adjustment",
  replacement_proposal: "plan_replacement",
  reschedule_proposal: "plan_reschedule",
  calibration_correction: "human_production_fix",
} as const;
export type WorkKind = keyof typeof WORK_TASKS;

const captionNatureSchema = z.enum(["permanent_fact", "commercial_condition", "regulated_claim", "none"]);
/** Sent to the model: the shape only. Anthropic refuses `maxItems` in an output schema (ticket 12, D-2), so the count is `captionReviewSchema`'s. */
export const captionReviewWireSchema = reviewOutputSchema.extend({ natures: z.array(captionNatureSchema).min(1) });
/** Accepted back from the model and from `complete_agent_work`: 1 to 4 natures. */
export const captionReviewSchema = captionReviewWireSchema.extend({ natures: z.array(captionNatureSchema).min(1).max(4) });
export const adjustmentResultSchema = z.object({ caption: z.string().min(1).max(4000) });
export const replacementResultSchema = z.object({ title: z.string().min(1).max(200), description: z.string().min(1).max(4000) });
export const scheduleResultSchema = z.object({ scheduledFor: z.string().datetime() });

export const workOutputSchemas = {
  review_caption: captionReviewSchema,
  plan_adjustment: adjustmentResultSchema,
  plan_replacement: replacementResultSchema,
  plan_reschedule: scheduleResultSchema,
};
/** The schema each kind SENDS to the model (shape only); `workOutputSchemas` is what the app validates the answer with. */
export const workOutputWireSchemas = { ...workOutputSchemas, review_caption: captionReviewWireSchema };

export const claimAgentWorkPayloadSchema = z.object({ sourceEventId: z.string().uuid(), runId: z.string().min(1) });
export const completeAgentWorkPayloadSchema = claimAgentWorkPayloadSchema.extend({ output: z.unknown(), refusal: z.literal("budget_exceeded").optional() });

export function workKind(value: unknown): WorkKind | null {
  return typeof value === "string" && Object.hasOwn(WORK_TASKS, value) ? value as WorkKind : null;
}

export const submitItemVersionPayloadSchema = z.object({
  itemId: z.string().uuid(), expectedVersionHash: z.string().min(1),
  caption: z.string().min(1).max(4000), creativeWorkOutputId: z.string().uuid().optional(),
});
