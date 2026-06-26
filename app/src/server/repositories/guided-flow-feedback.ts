import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  assistantGuidedFlowFeedback,
  type AssistantGuidedFlowFeedback,
  type NewAssistantGuidedFlowFeedback,
} from "../db/schema";
import { getAssistantThreadById } from "./assistant-thread";

export const DIAGNOSIS_RATINGS = ["useful", "incomplete", "misleading"] as const;
export const CREATIVE_PLAN_RATINGS = [
  "generation_ready",
  "partially_useful",
  "unusable",
] as const;

export const FEEDBACK_KINDS = ["diagnosis_utility", "creative_plan_readiness"] as const;

export class GuidedFlowFeedbackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuidedFlowFeedbackValidationError";
  }
}

const MAX_REASON_TEXT = 256;

export function sanitizeFeedbackReasonText(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim().slice(0, MAX_REASON_TEXT);
  return trimmed.length > 0 ? trimmed : null;
}

async function assertFeedbackScope(
  workspaceId: string,
  clientProfileId: string,
  threadId: string
) {
  const thread = await getAssistantThreadById(workspaceId, threadId);
  if (!thread) {
    throw new GuidedFlowFeedbackValidationError("Thread not found");
  }
  if (thread.clientProfileId !== clientProfileId) {
    throw new GuidedFlowFeedbackValidationError("Client profile scope mismatch");
  }
}

export function assertValidFeedbackRating(
  feedbackKind: string,
  rating: string
) {
  if (feedbackKind === "diagnosis_utility") {
    if (!DIAGNOSIS_RATINGS.includes(rating as (typeof DIAGNOSIS_RATINGS)[number])) {
      throw new GuidedFlowFeedbackValidationError("Invalid diagnosis rating");
    }
    return;
  }
  if (feedbackKind === "creative_plan_readiness") {
    if (
      !CREATIVE_PLAN_RATINGS.includes(rating as (typeof CREATIVE_PLAN_RATINGS)[number])
    ) {
      throw new GuidedFlowFeedbackValidationError("Invalid creative plan rating");
    }
    return;
  }
  throw new GuidedFlowFeedbackValidationError("Invalid feedback kind");
}

export async function insertGuidedFlowFeedback(
  input: NewAssistantGuidedFlowFeedback
): Promise<AssistantGuidedFlowFeedback> {
  assertValidFeedbackRating(input.feedbackKind, input.rating);
  await assertFeedbackScope(input.workspaceId, input.clientProfileId, input.threadId);

  const [row] = await db
    .insert(assistantGuidedFlowFeedback)
    .values({
      ...input,
      reasonText: sanitizeFeedbackReasonText(input.reasonText),
    })
    .returning();

  return row;
}

export async function listGuidedFlowFeedbackByThread(
  workspaceId: string,
  threadId: string
): Promise<AssistantGuidedFlowFeedback[]> {
  return db
    .select()
    .from(assistantGuidedFlowFeedback)
    .where(
      and(
        eq(assistantGuidedFlowFeedback.workspaceId, workspaceId),
        eq(assistantGuidedFlowFeedback.threadId, threadId)
      )
    )
    .orderBy(desc(assistantGuidedFlowFeedback.createdAt))
    .limit(50);
}
