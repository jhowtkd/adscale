import { eq, and, asc } from "drizzle-orm";
import { db } from "../db";
import {
  creativeWorkItems,
  creativeWorkOutputs,
  type CreativeWorkItem,
  type CreativeWorkOutput,
} from "../db/schema";
import {
  CREATIVE_LEVELS,
  resolveCreativeWorkStatus,
  type CreativeWorkStatus,
  type CreativeWorkIdentitySnapshot,
  type SocialPostBrief,
  type SocialPostCopy,
} from "../creative-work/contracts";

export type CreativeWorkFormat = "1:1" | "4:5" | "9:16";
export type CreativeWorkToolKind = "social_post";

export interface CreateCreativeWorkInput {
  workspaceId: string;
  clientProfileId: string;
  createdByUserId: string;
  toolKind: CreativeWorkToolKind;
  brief: SocialPostBrief;
  format: CreativeWorkFormat;
}

export interface CompleteCreativeWorkOutputData {
  outputKey: string;
  cost: number;
  quality: Record<string, unknown> | null;
}

export async function createCreativeWork(
  input: CreateCreativeWorkInput
): Promise<CreativeWorkItem> {
  const [row] = await db
    .insert(creativeWorkItems)
    .values({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      createdByUserId: input.createdByUserId,
      toolKind: input.toolKind,
      brief: input.brief,
      format: input.format,
      status: "draft",
    })
    .returning();
  return row;
}

export async function getCreativeWork(
  workspaceId: string,
  workItemId: string
): Promise<{ work: CreativeWorkItem; outputs: CreativeWorkOutput[] } | null> {
  const workRows = await db
    .select()
    .from(creativeWorkItems)
    .where(
      and(
        eq(creativeWorkItems.workspaceId, workspaceId),
        eq(creativeWorkItems.id, workItemId)
      )
    )
    .orderBy(asc(creativeWorkItems.createdAt))
    .limit(1);

  if (workRows.length === 0) {
    return null;
  }

  const outputs = await db
    .select()
    .from(creativeWorkOutputs)
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId)
      )
    )
    .orderBy(asc(creativeWorkOutputs.creativeLevel));

  return { work: workRows[0], outputs };
}

export async function setCreativeWorkCopy(
  workspaceId: string,
  workItemId: string,
  copy: SocialPostCopy
): Promise<CreativeWorkItem | null> {
  const [row] = await db
    .update(creativeWorkItems)
    .set({ copy })
    .where(
      and(
        eq(creativeWorkItems.workspaceId, workspaceId),
        eq(creativeWorkItems.id, workItemId)
      )
    )
    .returning();
  return row ?? null;
}

export async function confirmCreativeWorkIdentity(
  workspaceId: string,
  workItemId: string,
  snapshot: CreativeWorkIdentitySnapshot
): Promise<CreativeWorkItem | null> {
  const [row] = await db
    .update(creativeWorkItems)
    .set({ identitySnapshot: snapshot })
    .where(
      and(
        eq(creativeWorkItems.workspaceId, workspaceId),
        eq(creativeWorkItems.id, workItemId)
      )
    )
    .returning();
  return row ?? null;
}

/**
 * Idempotent triplet creation: inserts one output per creative level using
 * `onConflictDoNothing`, then queries the resulting rows so repeated calls
 * return the same IDs.
 */
export async function createCreativeWorkOutputs(
  workspaceId: string,
  workItemId: string
): Promise<CreativeWorkOutput[]> {
  const now = new Date();
  const seedRows = CREATIVE_LEVELS.map((creativeLevel) => ({
    workspaceId,
    workItemId,
    creativeLevel,
    status: "queued" as const,
    isSelected: false,
    createdAt: now,
    updatedAt: now,
  }));

  await db
    .insert(creativeWorkOutputs)
    .values(seedRows)
    .onConflictDoNothing();

  const rows = await db
    .select()
    .from(creativeWorkOutputs)
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId)
      )
    )
    .orderBy(asc(creativeWorkOutputs.creativeLevel));

  return rows;
}

export async function markCreativeWorkOutputProcessing(
  workspaceId: string,
  workItemId: string,
  outputId: string
): Promise<CreativeWorkOutput | null> {
  const [row] = await db
    .update(creativeWorkOutputs)
    .set({ status: "processing", updatedAt: new Date() })
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
        eq(creativeWorkOutputs.id, outputId)
      )
    )
    .returning();
  return row ?? null;
}

export async function completeCreativeWorkOutput(
  workspaceId: string,
  workItemId: string,
  outputId: string,
  data: CompleteCreativeWorkOutputData
): Promise<CreativeWorkOutput | null> {
  const [row] = await db
    .update(creativeWorkOutputs)
    .set({
      status: "completed",
      outputKey: data.outputKey,
      cost: data.cost,
      quality: data.quality,
      failureCode: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
        eq(creativeWorkOutputs.id, outputId)
      )
    )
    .returning();
  return row ?? null;
}

export async function failCreativeWorkOutput(
  workspaceId: string,
  workItemId: string,
  outputId: string,
  failureCode: string
): Promise<CreativeWorkOutput | null> {
  const [row] = await db
    .update(creativeWorkOutputs)
    .set({
      status: "failed",
      failureCode,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
        eq(creativeWorkOutputs.id, outputId)
      )
    )
    .returning();
  return row ?? null;
}

export async function refreshCreativeWorkStatus(
  workspaceId: string,
  workItemId: string
): Promise<CreativeWorkStatus> {
  const outputs = await db
    .select({ status: creativeWorkOutputs.status })
    .from(creativeWorkOutputs)
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId)
      )
    );
  return resolveCreativeWorkStatus(outputs.map((o) => o.status));
}

/**
 * Atomic selection: clears any previously selected output in the same
 * transaction before marking the new one. Relies on the unique partial index
 * on `is_selected = true` per work item to keep the invariant.
 */
export async function selectCreativeWorkOutput(
  workspaceId: string,
  workItemId: string,
  outputId: string
): Promise<CreativeWorkOutput | null> {
  return db.transaction(async (tx) => {
    await tx
      .update(creativeWorkOutputs)
      .set({ isSelected: false, updatedAt: new Date() })
      .where(
        and(
          eq(creativeWorkOutputs.workspaceId, workspaceId),
          eq(creativeWorkOutputs.workItemId, workItemId),
          eq(creativeWorkOutputs.isSelected, true)
        )
      );

    const [selected] = await tx
      .update(creativeWorkOutputs)
      .set({ isSelected: true, updatedAt: new Date() })
      .where(
        and(
          eq(creativeWorkOutputs.workspaceId, workspaceId),
          eq(creativeWorkOutputs.workItemId, workItemId),
          eq(creativeWorkOutputs.id, outputId)
        )
      )
      .returning();

    return selected ?? null;
  });
}