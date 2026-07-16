import { eq, and, asc, desc, inArray, lt } from "drizzle-orm";
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

/** Workspace-scoped list for canonical queries (Phase 2). No cross-tenant leak. */
export async function listCreativeWorks(
  workspaceId: string,
  limit = 50
): Promise<CreativeWorkItem[]> {
  return db
    .select()
    .from(creativeWorkItems)
    .where(eq(creativeWorkItems.workspaceId, workspaceId))
    .orderBy(desc(creativeWorkItems.updatedAt))
    .limit(limit);
}

/**
 * Same as listCreativeWorks, but attaches real outputs so list/open share
 * identical projection rules (no synthetic rows).
 */
export async function listCreativeWorksWithOutputs(
  workspaceId: string,
  limit = 50
): Promise<Array<{ work: CreativeWorkItem; outputs: CreativeWorkOutput[] }>> {
  const works = await listCreativeWorks(workspaceId, limit);
  if (works.length === 0) return [];

  const ids = works.map((w) => w.id);
  const outputs = await db
    .select()
    .from(creativeWorkOutputs)
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        inArray(creativeWorkOutputs.workItemId, ids)
      )
    )
    .orderBy(asc(creativeWorkOutputs.creativeLevel));

  const byWork = new Map<string, CreativeWorkOutput[]>();
  for (const output of outputs) {
    const list = byWork.get(output.workItemId) ?? [];
    list.push(output);
    byWork.set(output.workItemId, list);
  }

  return works.map((work) => ({
    work,
    outputs: byWork.get(work.id) ?? [],
  }));
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

/** Persist SocialPostBrief JSONB (canonical briefing write → brief column). */
export async function setCreativeWorkBrief(
  workspaceId: string,
  workItemId: string,
  brief: SocialPostBrief
): Promise<CreativeWorkItem | null> {
  const [row] = await db
    .update(creativeWorkItems)
    .set({ brief })
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
    .set({ identitySnapshot: snapshot, status: "ready" })
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

/**
 * Reconciles jobs that disappeared after dispatch (for example, a worker
 * serialization crash). Once the lease expires the output becomes terminal,
 * which lets the UI offer its existing retry action instead of polling forever.
 */
export async function failStaleCreativeWorkOutputs(
  workspaceId: string,
  workItemId: string,
  staleBefore: Date,
): Promise<CreativeWorkOutput[]> {
  return db
    .update(creativeWorkOutputs)
    .set({
      status: "failed",
      failureCode: "generation_timeout",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
        inArray(creativeWorkOutputs.status, ["queued", "processing"]),
        lt(creativeWorkOutputs.updatedAt, staleBefore),
      ),
    )
    .returning();
}

/**
 * Directly set the work-item status. Used by the generate API route to
 * flip `"ready"` → `"generating"` immediately after dispatching the
 * triplet so the frontend polling hook engages. Aggregate recomputation
 * is left to {@link refreshCreativeWorkStatus} once outputs settle.
 */
export async function setCreativeWorkStatus(
  workspaceId: string,
  workItemId: string,
  status: CreativeWorkStatus
): Promise<CreativeWorkItem | null> {
  const [row] = await db
    .update(creativeWorkItems)
    .set({ status, updatedAt: new Date() })
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
 * Recomputes the aggregate `creative_work_items.status` from the child
 * outputs and **persists** the result. The previous implementation only
 * computed the value in memory and never wrote it back, which meant the
 * `useCreativeWork` polling hook (keyed on `status === "generating"`)
 * never engaged after dispatch — the work row stayed at `"ready"`
 * forever, even when outputs were actively generating.
 *
 * Callers receive the resolved status so they can decide whether to take
 * downstream action (e.g. log a state change).
 */
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
  const next = resolveCreativeWorkStatus(outputs.map((o) => o.status));
  await db
    .update(creativeWorkItems)
    .set({ status: next, updatedAt: new Date() })
    .where(
      and(
        eq(creativeWorkItems.workspaceId, workspaceId),
        eq(creativeWorkItems.id, workItemId)
      )
    );
  return next;
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

/**
 * Free retry: flip a failed output back to `queued` with a status guard so a
 * concurrent change loses the race cleanly (returns null). No billing side
 * effects — the original triplet charge already covered generation.
 */
export async function requeueFailedCreativeWorkOutput(
  workspaceId: string,
  workItemId: string,
  outputId: string
): Promise<CreativeWorkOutput | null> {
  const [reset] = await db
    .update(creativeWorkOutputs)
    .set({
      status: "queued",
      failureCode: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
        eq(creativeWorkOutputs.id, outputId),
        eq(creativeWorkOutputs.status, "failed")
      )
    )
    .returning();
  return reset ?? null;
}
