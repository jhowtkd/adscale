import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  creativeWorkItems,
  creativeWorkOutputs,
  pieceFavorites,
} from "@/server/db/schema";

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
}): Promise<{ id: string; created: boolean }> {
  const [existing] = await db
    .select({ id: pieceFavorites.id })
    .from(pieceFavorites)
    .where(
      and(
        eq(pieceFavorites.userId, input.userId),
        eq(pieceFavorites.outputId, input.outputId),
      ),
    )
    .limit(1);
  if (existing) return { id: existing.id, created: false };

  const [created] = await db
    .insert(pieceFavorites)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      outputId: input.outputId,
    })
    .returning({ id: pieceFavorites.id });
  return { id: created!.id, created: true };
}

export async function removePieceFavorite(input: {
  userId: string;
  outputId: string;
}): Promise<boolean> {
  const removed = await db
    .delete(pieceFavorites)
    .where(
      and(
        eq(pieceFavorites.userId, input.userId),
        eq(pieceFavorites.outputId, input.outputId),
      ),
    )
    .returning({ id: pieceFavorites.id });
  return removed.length > 0;
}

export async function listPieceFavorites(input: {
  workspaceId: string;
  userId: string;
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
