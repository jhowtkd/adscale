import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { assistantPlanFeedbackDrafts } from "@/server/db/schema";
import type { ArtifactScope } from "@/server/repositories/artifact-version";

const MAX_DRAFT_TEXT = 2_000;

export class PlanFeedbackDraftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanFeedbackDraftValidationError";
  }
}

function draftScope(scope: ArtifactScope) {
  return and(
    eq(assistantPlanFeedbackDrafts.workspaceId, scope.workspaceId),
    eq(assistantPlanFeedbackDrafts.clientProfileId, scope.clientProfileId),
    eq(assistantPlanFeedbackDrafts.campaignId, scope.campaignId),
    eq(assistantPlanFeedbackDrafts.threadId, scope.threadId)
  );
}

function sanitizeDraftText(text: string): string {
  const trimmed = text.trim().slice(0, MAX_DRAFT_TEXT);
  if (trimmed.length > MAX_DRAFT_TEXT) {
    throw new PlanFeedbackDraftValidationError("Draft text exceeds maximum length");
  }
  return trimmed;
}

export async function getPlanFeedbackDraft(scope: ArtifactScope) {
  const [row] = await db
    .select()
    .from(assistantPlanFeedbackDrafts)
    .where(draftScope(scope))
    .limit(1);
  return row ?? null;
}

export async function savePlanFeedbackDraft(scope: ArtifactScope, text: string) {
  if (text.length > MAX_DRAFT_TEXT) {
    throw new PlanFeedbackDraftValidationError("Draft text exceeds maximum length");
  }
  const draftText = sanitizeDraftText(text);
  const [row] = await db
    .insert(assistantPlanFeedbackDrafts)
    .values({
      threadId: scope.threadId,
      workspaceId: scope.workspaceId,
      clientProfileId: scope.clientProfileId,
      campaignId: scope.campaignId,
      draftText,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: assistantPlanFeedbackDrafts.threadId,
      set: {
        draftText,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row!;
}

export async function clearPlanFeedbackDraft(scope: ArtifactScope) {
  const deleted = await db
    .delete(assistantPlanFeedbackDrafts)
    .where(draftScope(scope))
    .returning();
  return deleted.length > 0;
}
