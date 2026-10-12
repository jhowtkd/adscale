import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  creativeWorkItems,
  creativeWorkOutputs,
  outputDecisionEvents,
  pieceFavorites,
} from "@/server/db/schema";
import {
  authorizeLocalLearning,
  type LocalLearningAuthorizationPort,
} from "@/server/brand-taste/local-learning-authorization";
import {
  buildOutputDecisionSnapshot,
  mapActionToSemantics,
  type OutputDecisionAction,
} from "@/server/output-learning/output-decision-events";

type FavoriteExecutor = Pick<typeof db, "select" | "insert" | "delete">;

async function recordFavoriteDecisionEvent(
  tx: FavoriteExecutor,
  input: { workspaceId: string; userId: string; outputId: string; favoriteId: string },
  action: Extract<OutputDecisionAction, "favorited" | "favorite_removed">,
  authorize: LocalLearningAuthorizationPort,
): Promise<void> {
  const [scope] = await tx
    .select({
      clientProfileId: creativeWorkItems.clientProfileId,
      campaignId: creativeWorkItems.campaignId,
      toolKind: creativeWorkItems.toolKind,
      targetFormat: creativeWorkOutputs.targetFormat,
      creativeLevel: creativeWorkOutputs.creativeLevel,
      status: creativeWorkOutputs.status,
    })
    .from(creativeWorkOutputs)
    .innerJoin(creativeWorkItems, and(
      eq(creativeWorkItems.id, creativeWorkOutputs.workItemId),
      eq(creativeWorkItems.workspaceId, input.workspaceId),
    ))
    .where(and(
      eq(creativeWorkOutputs.workspaceId, input.workspaceId),
      eq(creativeWorkOutputs.id, input.outputId),
    ))
    .limit(1);
  if (!scope) return;
  const authorization = await authorize({
    workspaceId: input.workspaceId,
    clientProfileId: scope.clientProfileId,
  });
  if (!authorization.allowed) return;
  const semantics = mapActionToSemantics(action);
  await tx.insert(outputDecisionEvents).values({
    workspaceId: input.workspaceId,
    userId: input.userId,
    clientProfileId: scope.clientProfileId,
    campaignId: scope.campaignId,
    derivationId: null,
    creativeWorkOutputId: input.outputId,
    action: semantics.action,
    direction: semantics.direction,
    strength: semantics.strength,
    source: "composer",
    contextSnapshot: buildOutputDecisionSnapshot({
      generationMode: scope.toolKind,
      format: scope.targetFormat,
      creativeLevel: scope.creativeLevel,
      status: scope.status,
    }),
    idempotencyKey: `piece-favorite:${input.favoriteId}:${action}`,
  });
}

export type PieceFavoriteListItem = {
  id: string;
  outputId: string;
  workItemId: string;
  name: string;
  createdAt: Date;
  downloadHref: string;
};

export async function getCreativeWorkOutputForFavorite(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
}) {
  const [row] = await db
    .select({
      id: creativeWorkOutputs.id,
      workspaceId: creativeWorkOutputs.workspaceId,
      workItemId: creativeWorkOutputs.workItemId,
      status: creativeWorkOutputs.status,
      outputKey: creativeWorkOutputs.outputKey,
    })
    .from(creativeWorkOutputs)
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, input.workspaceId),
        eq(creativeWorkOutputs.workItemId, input.workItemId),
        eq(creativeWorkOutputs.id, input.outputId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function isPieceFavorited(input: {
  userId: string;
  outputId: string;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: pieceFavorites.id })
    .from(pieceFavorites)
    .where(
      and(
        eq(pieceFavorites.userId, input.userId),
        eq(pieceFavorites.outputId, input.outputId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function addPieceFavorite(input: {
  workspaceId: string;
  userId: string;
  outputId: string;
}, authorize: LocalLearningAuthorizationPort = authorizeLocalLearning): Promise<{ id: string; created: boolean }> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(pieceFavorites)
      .values(input)
      .onConflictDoNothing({ target: [pieceFavorites.userId, pieceFavorites.outputId] })
      .returning({ id: pieceFavorites.id });
    if (!created) {
      const [existing] = await tx
        .select({ id: pieceFavorites.id })
        .from(pieceFavorites)
        .where(
          and(
            eq(pieceFavorites.userId, input.userId),
            eq(pieceFavorites.outputId, input.outputId),
          ),
        )
        .limit(1);
      if (!existing) throw new Error("Favorite changed concurrently; retry the request");
      return { id: existing.id, created: false };
    }
    await recordFavoriteDecisionEvent(tx, { ...input, favoriteId: created.id }, "favorited", authorize);
    return { id: created.id, created: true };
  });
}

export async function removePieceFavorite(input: {
  workspaceId?: string;
  userId: string;
  outputId: string;
}, authorize: LocalLearningAuthorizationPort = authorizeLocalLearning): Promise<boolean> {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(pieceFavorites)
      .where(
        and(
          eq(pieceFavorites.userId, input.userId),
          eq(pieceFavorites.outputId, input.outputId),
        ),
      )
      .returning({ id: pieceFavorites.id, workspaceId: pieceFavorites.workspaceId });
    if (removed.length === 0) return false;
    const workspaceId = input.workspaceId ?? removed[0].workspaceId;
    await recordFavoriteDecisionEvent(
      tx,
      { workspaceId, userId: input.userId, outputId: input.outputId, favoriteId: removed[0].id },
      "favorite_removed",
      authorize,
    );
    return true;
  });
}

export async function listPieceFavorites(input: {
  workspaceId: string;
  userId: string;
  clientProfileId?: string;
}): Promise<PieceFavoriteListItem[]> {
  const rows = await db
    .select({
      id: pieceFavorites.id,
      outputId: pieceFavorites.outputId,
      workItemId: creativeWorkOutputs.workItemId,
      name: creativeWorkItems.title,
      createdAt: pieceFavorites.createdAt,
    })
    .from(pieceFavorites)
    .innerJoin(creativeWorkOutputs, eq(creativeWorkOutputs.id, pieceFavorites.outputId))
    .innerJoin(creativeWorkItems, eq(creativeWorkItems.id, creativeWorkOutputs.workItemId))
    .where(
      and(
        eq(pieceFavorites.workspaceId, input.workspaceId),
        eq(pieceFavorites.userId, input.userId),
        eq(creativeWorkOutputs.status, "completed"),
        input.clientProfileId ? eq(creativeWorkItems.clientProfileId, input.clientProfileId) : undefined,
      ),
    )
    .orderBy(desc(pieceFavorites.createdAt));

  return rows.map((row) => ({
    id: row.id,
    outputId: row.outputId,
    workItemId: row.workItemId,
    name: row.name?.trim() || "Peça",
    createdAt: row.createdAt,
    downloadHref: `/api/creative-work/${row.workItemId}/outputs/${row.outputId}/download`,
  }));
}
