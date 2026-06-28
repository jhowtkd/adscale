import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { assistantCreativeFeedbackDrafts } from "@/server/db/schema";
import type { ArtifactScope } from "@/server/repositories/artifact-version";

const MAX_DRAFT_TEXT = 2_000;

export class CreativeFeedbackDraftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreativeFeedbackDraftValidationError";
  }
}

function draftScope(scope: ArtifactScope) {
  return and(
    eq(assistantCreativeFeedbackDrafts.workspaceId, scope.workspaceId),
    eq(assistantCreativeFeedbackDrafts.clientProfileId, scope.clientProfileId),
    eq(assistantCreativeFeedbackDrafts.campaignId, scope.campaignId),
    eq(assistantCreativeFeedbackDrafts.threadId, scope.threadId)
  );
}

function sanitizeDraftText(text: string): string {
  const trimmed = text.trim().slice(0, MAX_DRAFT_TEXT);
  if (trimmed.length > MAX_DRAFT_TEXT) {
    throw new CreativeFeedbackDraftValidationError(
      "Draft text exceeds maximum length"
    );
  }
  return trimmed;
}

export async function getCreativeFeedbackDraft(scope: ArtifactScope) {
  const [row] = await db
    .select()
    .from(assistantCreativeFeedbackDrafts)
    .where(draftScope(scope))
    .limit(1);
  return row ?? null;
}

export async function saveCreativeFeedbackDraft(
  scope: ArtifactScope,
  text: string
) {
  if (text.length > MAX_DRAFT_TEXT) {
    throw new CreativeFeedbackDraftValidationError(
      "Draft text exceeds maximum length"
    );
  }
  const draftText = sanitizeDraftText(text);
  const [row] = await db
    .insert(assistantCreativeFeedbackDrafts)
    .values({
      threadId: scope.threadId,
      workspaceId: scope.workspaceId,
      clientProfileId: scope.clientProfileId,
      campaignId: scope.campaignId,
      draftText,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: assistantCreativeFeedbackDrafts.threadId,
      set: {
        draftText,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row!;
}

export async function clearCreativeFeedbackDraft(scope: ArtifactScope) {
  const deleted = await db
    .delete(assistantCreativeFeedbackDrafts)
    .where(draftScope(scope))
    .returning();
  return deleted.length > 0;
}
