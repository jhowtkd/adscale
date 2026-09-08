import { and, eq, lt, or, desc } from "drizzle-orm";
import { db } from "../db";
import { visualRecipes, type VisualRecipe } from "../db/schema";
import {
  boundCatalogLimit,
  takeCatalogPage,
  type CatalogQuery,
  type CatalogPageResult,
} from "@/lib/catalog-page";
import type { VisualRecipeDocument } from "../creative-work/visual-recipe";

export async function insertVisualRecipe(input: {
  workspaceId: string;
  clientProfileId: string;
  document: VisualRecipeDocument;
}): Promise<VisualRecipe> {
  const existing = await getVisualRecipeByOriginOutput(input.workspaceId, input.clientProfileId, input.document.originOutputId);
  if (existing) return existing;

  const [created] = await db.insert(visualRecipes).values({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    version: 1,
    document: input.document,
    originWorkId: input.document.originWorkId,
    originOutputId: input.document.originOutputId,
  }).onConflictDoNothing().returning();
  if (created) return created;

  const replayed = await getVisualRecipeByOriginOutput(input.workspaceId, input.clientProfileId, input.document.originOutputId);
  if (!replayed) throw new Error("visual_recipe_conflict_without_row");
  return replayed;
}

export async function getVisualRecipeById(
  workspaceId: string,
  clientProfileId: string,
  recipeId: string,
): Promise<VisualRecipe | null> {
  const [row] = await db.select().from(visualRecipes).where(and(
    eq(visualRecipes.id, recipeId),
    eq(visualRecipes.workspaceId, workspaceId),
    eq(visualRecipes.clientProfileId, clientProfileId),
  )).limit(1);
  return row ?? null;
}

export async function getVisualRecipeInWorkspace(
  workspaceId: string,
  recipeId: string,
): Promise<VisualRecipe | null> {
  const [row] = await db.select().from(visualRecipes).where(and(
    eq(visualRecipes.id, recipeId),
    eq(visualRecipes.workspaceId, workspaceId),
  )).limit(1);
  return row ?? null;
}

export async function getVisualRecipeByOriginOutput(
  workspaceId: string,
  clientProfileId: string,
  originOutputId: string,
): Promise<VisualRecipe | null> {
  const [row] = await db.select().from(visualRecipes).where(and(
    eq(visualRecipes.originOutputId, originOutputId),
    eq(visualRecipes.workspaceId, workspaceId),
    eq(visualRecipes.clientProfileId, clientProfileId),
  )).limit(1);
  return row ?? null;
}

export async function listVisualRecipes(
  workspaceId: string,
  clientProfileId: string,
  page: CatalogQuery = {},
): Promise<CatalogPageResult<VisualRecipe>> {
  const limit = boundCatalogLimit(page.limit);
  const cursorWhere = page.cursor
    ? or(
        lt(visualRecipes.updatedAt, page.cursor.at),
        and(eq(visualRecipes.updatedAt, page.cursor.at), lt(visualRecipes.id, page.cursor.id)),
      )
    : undefined;
  const rows = await db
    .select()
    .from(visualRecipes)
    .where(cursorWhere
      ? and(
          eq(visualRecipes.workspaceId, workspaceId),
          eq(visualRecipes.clientProfileId, clientProfileId),
          cursorWhere,
        )
      : and(
          eq(visualRecipes.workspaceId, workspaceId),
          eq(visualRecipes.clientProfileId, clientProfileId),
        ))
    .orderBy(desc(visualRecipes.updatedAt), desc(visualRecipes.id))
    .limit(limit + 1);
  return takeCatalogPage(rows, limit, (row) => ({ at: row.updatedAt, id: row.id }));
}
