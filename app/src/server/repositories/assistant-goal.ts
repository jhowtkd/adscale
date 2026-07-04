import { and, asc, eq, inArray } from "drizzle-orm";
import {
  goalBriefSchema,
  goalPlanSchema,
  type GoalBrief,
  type GoalPlan,
  type GoalStage,
} from "@/lib/assistant/goal";
import { db } from "../db";
import {
  assistantArtifactAnnotations,
  assistantGoalRuns,
  clientCorpusConsents,
} from "../db/schema";
import { resolveGoalCreativeVersion } from "@/server/assistant/goal/service";
import { getAssistantThreadById } from "./assistant-thread";
import { containsDeniedPersistenceKeys } from "./assistant-types";

export interface GoalRunScope {
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  userId: string;
}

export class AssistantGoalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistantGoalValidationError";
  }
}

export class AssistantGoalConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistantGoalConflictError";
  }
}

const EMPTY_BRIEF: GoalBrief = goalBriefSchema.parse({});
const EMPTY_PLAN: GoalPlan = goalPlanSchema.parse({});

function assertSafeJson(value: unknown, label: string) {
  if (containsDeniedPersistenceKeys(value)) {
    throw new AssistantGoalValidationError(`${label} contains denied persistence keys`);
  }
}

function assertRectBounds(rect: { x: number; y: number; width: number; height: number }) {
  const { x, y, width, height } = rect;
  if (
    x < 0 ||
    x > 1 ||
    y < 0 ||
    y > 1 ||
    width <= 0 ||
    width > 1 ||
    height <= 0 ||
    height > 1 ||
    x + width > 1 ||
    y + height > 1
  ) {
    throw new AssistantGoalValidationError("rectangle_out_of_bounds");
  }
}

function assertGoalScope(
  scope: { workspaceId: string; clientProfileId: string; threadId: string },
  row: typeof assistantGoalRuns.$inferSelect
) {
  if (row.workspaceId !== scope.workspaceId) {
    throw new AssistantGoalValidationError("Cross-workspace access rejected");
  }
  if (row.clientProfileId !== scope.clientProfileId) {
    throw new AssistantGoalValidationError("Cross-client access rejected");
  }
  if (row.threadId !== scope.threadId) {
    throw new AssistantGoalValidationError("Cross-thread access rejected");
  }
}

async function assertThreadScope(
  workspaceId: string,
  threadId: string,
  clientProfileId: string
) {
  const thread = await getAssistantThreadById(workspaceId, threadId);
  if (!thread) {
    throw new AssistantGoalValidationError("Thread not found");
  }
  if (thread.clientProfileId !== clientProfileId) {
    throw new AssistantGoalValidationError("Client profile does not match thread scope");
  }
  return thread;
}

export async function getGoalRunScoped(
  workspaceId: string,
  clientProfileId: string,
  threadId: string
) {
  const [row] = await db
    .select()
    .from(assistantGoalRuns)
    .where(
      and(
        eq(assistantGoalRuns.workspaceId, workspaceId),
        eq(assistantGoalRuns.clientProfileId, clientProfileId),
        eq(assistantGoalRuns.threadId, threadId)
      )
    )
    .limit(1);

  if (!row) return null;
  assertGoalScope({ workspaceId, clientProfileId, threadId }, row);
  return row;
}

export async function getGoalRunByThread(workspaceId: string, threadId: string) {
  const [row] = await db
    .select()
    .from(assistantGoalRuns)
    .where(
      and(
        eq(assistantGoalRuns.workspaceId, workspaceId),
        eq(assistantGoalRuns.threadId, threadId)
      )
    )
    .limit(1);
  return row ?? null;
}

export interface CreateGoalRunInput extends GoalRunScope {
  objective?: string;
}

/**
 * Idempotently creates one goal run per thread. A thread owns at most one
 * creative objective (enforced by the `assistant_goal_runs_thread_uq` unique
 * index). Replays return the existing row instead of inserting a duplicate.
 */
export async function createGoalRun(input: CreateGoalRunInput) {
  await assertThreadScope(
    input.workspaceId,
    input.threadId,
    input.clientProfileId
  );

  const existing = await getGoalRunScoped(
    input.workspaceId,
    input.clientProfileId,
    input.threadId
  );
  if (existing) {
    return existing;
  }

  const objective = (input.objective ?? "").trim();
  const [created] = await db
    .insert(assistantGoalRuns)
    .values({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      threadId: input.threadId,
      startedByUserId: input.userId,
      objective,
      stage: "intake",
      brief: EMPTY_BRIEF,
      plan: EMPTY_PLAN,
      assumptions: [],
      blockers: ["productOffer", "audience", "constraints"],
      revision: 0,
    })
    .returning();

  return created!;
}

export interface UpdateGoalRunInput {
  goalRunId: string;
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  expectedRevision: number;
  patch: Partial<{
    campaignId: string | null;
    objective: string;
    stage: GoalStage;
    brief: GoalBrief;
    plan: GoalPlan;
    assumptions: string[];
    blockers: string[];
    queuedInstruction: string | null;
    resumeStage: GoalStage | null;
    selectedBaseVersionId: string | null;
    completedAt: Date | null;
    stoppedAt: Date | null;
  }>;
}

/**
 * Scoped optimistic-concurrency update. The WHERE clause pins the goal by id
 * AND the full four-tuple scope AND the expected revision, so a row is updated
 * only when the caller's view of the world is still authoritative. When no row
 * matches, the caller has stale state and must reload.
 */
export async function updateGoalRun(input: UpdateGoalRunInput) {
  if (input.patch.brief !== undefined) {
    assertSafeJson(input.patch.brief, "brief");
  }
  if (input.patch.plan !== undefined) {
    assertSafeJson(input.patch.plan, "plan");
  }
  if (input.patch.assumptions !== undefined) {
    assertSafeJson(input.patch.assumptions, "assumptions");
  }

  const [updated] = await db
    .update(assistantGoalRuns)
    .set({
      ...input.patch,
      revision: input.expectedRevision + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(assistantGoalRuns.id, input.goalRunId),
        eq(assistantGoalRuns.workspaceId, input.workspaceId),
        eq(assistantGoalRuns.clientProfileId, input.clientProfileId),
        eq(assistantGoalRuns.threadId, input.threadId),
        eq(assistantGoalRuns.revision, input.expectedRevision)
      )
    )
    .returning();

  if (!updated) {
    throw new AssistantGoalConflictError("Goal revision conflict");
  }
  return updated;
}

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

export interface AnnotationDraftInput {
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  goalRunId: string;
  versionId: string;
  createdByUserId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  comment: string;
}

export async function upsertAnnotationDraft(input: AnnotationDraftInput) {
  assertRectBounds(input);
  await assertThreadScope(
    input.workspaceId,
    input.threadId,
    input.clientProfileId
  );

  // The annotation must belong to a version in this goal's thread.
  const goal = await getGoalRunScoped(
    input.workspaceId,
    input.clientProfileId,
    input.threadId
  );
  if (!goal || goal.id !== input.goalRunId) {
    throw new AssistantGoalValidationError("Annotation goal not found");
  }

  const resolvedVersion = await resolveGoalCreativeVersion(
    {
      id: goal.id,
      workspaceId: goal.workspaceId,
      clientProfileId: goal.clientProfileId,
      threadId: goal.threadId,
      campaignId: goal.campaignId,
      objective: goal.objective,
      stage: goal.stage,
      brief: goalBriefSchema.parse(goal.brief),
      plan: goalPlanSchema.parse(goal.plan),
      assumptions: goal.assumptions ?? [],
      blockers: goal.blockers ?? [],
      revision: goal.revision,
    },
    input.versionId
  );
  if (!resolvedVersion) {
    throw new AssistantGoalValidationError("Annotation version not in scope");
  }

  const comment = input.comment.trim();
  if (!comment) {
    throw new AssistantGoalValidationError("Annotation comment required");
  }

  const [created] = await db
    .insert(assistantArtifactAnnotations)
    .values({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      threadId: input.threadId,
      goalRunId: input.goalRunId,
      versionId: input.versionId,
      createdByUserId: input.createdByUserId,
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
      comment,
      status: "draft",
    })
    .returning();

  return created!;
}

export async function deleteAnnotationDraft(input: {
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  annotationId: string;
}) {
  await assertThreadScope(
    input.workspaceId,
    input.threadId,
    input.clientProfileId
  );

  const [deleted] = await db
    .delete(assistantArtifactAnnotations)
    .where(
      and(
        eq(assistantArtifactAnnotations.id, input.annotationId),
        eq(assistantArtifactAnnotations.workspaceId, input.workspaceId),
        eq(assistantArtifactAnnotations.clientProfileId, input.clientProfileId),
        eq(assistantArtifactAnnotations.threadId, input.threadId),
        eq(assistantArtifactAnnotations.status, "draft")
      )
    )
    .returning();

  if (!deleted) {
    throw new AssistantGoalValidationError("Annotation not found");
  }
  return deleted;
}

export async function listAnnotationsForVersion(
  workspaceId: string,
  goalRunId: string,
  versionId: string
) {
  return db
    .select()
    .from(assistantArtifactAnnotations)
    .where(
      and(
        eq(assistantArtifactAnnotations.workspaceId, workspaceId),
        eq(assistantArtifactAnnotations.goalRunId, goalRunId),
        eq(assistantArtifactAnnotations.versionId, versionId)
      )
    )
    .orderBy(asc(assistantArtifactAnnotations.createdAt));
}

export interface SubmitAnnotationBatchInput {
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  goalRunId: string;
  sourceVersionId: string;
  actionRecordId: string;
}

/**
 * Freezes every still-draft annotation for the source version as one paid
 * revision batch, stamping them with the single action record that owns the
 * revision. Subsequent annotation reads see `submitted`; the revision handler
 * marks them `addressed` only after the new version succeeds.
 */
export async function submitAnnotationBatch(input: SubmitAnnotationBatchInput) {
  await assertThreadScope(
    input.workspaceId,
    input.threadId,
    input.clientProfileId
  );

  const drafts = await db
    .select()
    .from(assistantArtifactAnnotations)
    .where(
      and(
        eq(assistantArtifactAnnotations.workspaceId, input.workspaceId),
        eq(assistantArtifactAnnotations.goalRunId, input.goalRunId),
        eq(assistantArtifactAnnotations.versionId, input.sourceVersionId),
        eq(assistantArtifactAnnotations.status, "draft")
      )
    )
    .orderBy(asc(assistantArtifactAnnotations.createdAt));

  if (drafts.length === 0) {
    return [];
  }

  const draftIds = drafts.map((d) => d.id);

  return db.transaction(async (tx) => {
    const updated = await tx
      .update(assistantArtifactAnnotations)
      .set({
        status: "submitted",
        actionRecordId: input.actionRecordId,
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(assistantArtifactAnnotations.id, draftIds),
          eq(assistantArtifactAnnotations.workspaceId, input.workspaceId)
        )
      )
      .returning();
    return updated;
  });
}

export interface MarkAnnotationsAddressedInput {
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  sourceVersionId: string;
  producedVersionId: string;
}

export async function markAnnotationsAddressed(
  input: MarkAnnotationsAddressedInput
) {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(assistantArtifactAnnotations)
      .set({
        status: "addressed",
        addressedByVersionId: input.producedVersionId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(assistantArtifactAnnotations.workspaceId, input.workspaceId),
          eq(assistantArtifactAnnotations.clientProfileId, input.clientProfileId),
          eq(assistantArtifactAnnotations.threadId, input.threadId),
          eq(assistantArtifactAnnotations.versionId, input.sourceVersionId),
          eq(assistantArtifactAnnotations.status, "submitted")
        )
      )
      .returning();
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Corpus consent
// ---------------------------------------------------------------------------

export interface CorpusConsentInput {
  workspaceId: string;
  clientProfileId: string;
  reviewedByUserId: string;
}

export async function grantCorpusConsent(input: CorpusConsentInput) {
  const now = new Date();
  const [row] = await db
    .insert(clientCorpusConsents)
    .values({
      clientProfileId: input.clientProfileId,
      workspaceId: input.workspaceId,
      status: "granted",
      reviewedByUserId: input.reviewedByUserId,
      grantedAt: now,
      revokedAt: null,
    })
    .onConflictDoUpdate({
      target: clientCorpusConsents.clientProfileId,
      set: {
        status: "granted",
        reviewedByUserId: input.reviewedByUserId,
        grantedAt: now,
        revokedAt: null,
        updatedAt: now,
      },
    })
    .returning();
  return row!;
}

export async function revokeCorpusConsent(input: CorpusConsentInput) {
  const now = new Date();
  const [row] = await db
    .insert(clientCorpusConsents)
    .values({
      clientProfileId: input.clientProfileId,
      workspaceId: input.workspaceId,
      status: "revoked",
      reviewedByUserId: input.reviewedByUserId,
      grantedAt: null,
      revokedAt: now,
    })
    .onConflictDoUpdate({
      target: clientCorpusConsents.clientProfileId,
      set: {
        status: "revoked",
        reviewedByUserId: input.reviewedByUserId,
        grantedAt: null,
        revokedAt: now,
        updatedAt: now,
      },
    })
    .returning();
  return row!;
}

export async function getCorpusConsent(
  workspaceId: string,
  clientProfileId: string
) {
  const [row] = await db
    .select()
    .from(clientCorpusConsents)
    .where(
      and(
        eq(clientCorpusConsents.workspaceId, workspaceId),
        eq(clientCorpusConsents.clientProfileId, clientProfileId)
      )
    )
    .limit(1);
  return row ?? null;
}
