import { eq, and, desc, sql, count, notInArray, or, lt, inArray } from "drizzle-orm";
import { db } from "../db";
import { workspaceAssets } from "../db/schema";
import {
  boundCatalogLimit,
  takeCatalogPage,
  type CatalogQuery,
  type CatalogPageResult,
} from "@/lib/catalog-page";

export interface CreateWorkspaceAssetInput {
  workspaceId: string;
  name: string;
  key: string;
  type: string;
  size: number;
  width?: number;
  height?: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

export async function createWorkspaceAsset(data: CreateWorkspaceAssetInput) {
  const result = await db
    .insert(workspaceAssets)
    .values({
      workspaceId: data.workspaceId,
      name: data.name,
      key: data.key,
      type: data.type,
      size: data.size,
      width: data.width ?? null,
      height: data.height ?? null,
      source: data.source ?? "upload",
      ...(data.metadata !== undefined && { metadata: data.metadata }),
    })
    .returning();
  return result[0];
}

/**
 * Insert idempotente por `key`. A constraint workspace_assets_key_unique e
 * GLOBAL, entao duas recuperacoes concorrentes do mesmo output disputam a
 * mesma chave: a perdedora recebe null em vez de estourar 23505.
 */
export async function createWorkspaceAssetIfKeyAbsent(
  data: CreateWorkspaceAssetInput,
): Promise<Awaited<ReturnType<typeof createWorkspaceAsset>> | null> {
  const result = await db
    .insert(workspaceAssets)
    .values({
      workspaceId: data.workspaceId,
      name: data.name,
      key: data.key,
      type: data.type,
      size: data.size,
      width: data.width ?? null,
      height: data.height ?? null,
      source: data.source ?? "upload",
      ...(data.metadata !== undefined && { metadata: data.metadata }),
    })
    .onConflictDoNothing({ target: workspaceAssets.key })
    .returning();
  return result[0] ?? null;
}

interface WorkspaceAssetFilters {
  query?: string;
  tags?: string[];
  type?: string;
  source?: string;
  excludeSources?: string[];
}

function buildAssetConditions(workspaceId: string, options: WorkspaceAssetFilters) {
  const conditions = [eq(workspaceAssets.workspaceId, workspaceId)];

  if (options.query) {
    const pattern = "%" + options.query + "%";
    conditions.push(
      sql`(${workspaceAssets.name} ILIKE ${pattern}
        OR ${workspaceAssets.aiDescription} ILIKE ${pattern}
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(${workspaceAssets.tags}, '[]'::jsonb)) AS tag
          WHERE tag ILIKE ${pattern}
        ))`
    );
  }

  if (options.type) {
    conditions.push(eq(workspaceAssets.type, options.type));
  }

  if (options.source) {
    conditions.push(eq(workspaceAssets.source, options.source));
  }

  if (options.excludeSources?.length) {
    conditions.push(notInArray(workspaceAssets.source, options.excludeSources));
  }

  if (options.tags && options.tags.length > 0) {
    conditions.push(
      sql`${workspaceAssets.tags} ?| ${options.tags}`
    );
  }

  return conditions;
}

export async function getWorkspaceAssets(
  workspaceId: string,
  options: WorkspaceAssetFilters & {
    limit?: number;
    offset?: number;
  } = {}
) {
  const conditions = buildAssetConditions(workspaceId, options);
  const limit = options.limit ?? 24;
  const offset = options.offset ?? 0;

  return db
    .select()
    .from(workspaceAssets)
    .where(and(...conditions))
    .orderBy(desc(workspaceAssets.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getWorkspaceAssetsCount(
  workspaceId: string,
  options: WorkspaceAssetFilters = {}
) {
  const conditions = buildAssetConditions(workspaceId, options);
  const result = await db
    .select({ count: count() })
    .from(workspaceAssets)
    .where(and(...conditions));
  return result[0]?.count ?? 0;
}

export async function getWorkspaceAssetById(id: string, workspaceId: string) {
  const result = await db
    .select()
    .from(workspaceAssets)
    .where(
      and(
        eq(workspaceAssets.id, id),
        eq(workspaceAssets.workspaceId, workspaceId)
      )
    )
    .limit(1);
  return result[0] ?? null;
}

export async function getWorkspaceAssetsByIds(workspaceId: string, ids: readonly string[]) {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return [];
  return db
    .select({ id: workspaceAssets.id, name: workspaceAssets.name, source: workspaceAssets.source })
    .from(workspaceAssets)
    .where(and(
      eq(workspaceAssets.workspaceId, workspaceId),
      inArray(workspaceAssets.id, uniqueIds),
    ));
}

export async function getWorkspaceAssetByKey(
  workspaceId: string,
  key: string
) {
  const [row] = await db
    .select()
    .from(workspaceAssets)
    .where(
      and(eq(workspaceAssets.workspaceId, workspaceId), eq(workspaceAssets.key, key))
    )
    .limit(1);
  return row ?? null;
}

export async function getCuratedInspirations(
  page: CatalogQuery = {},
): Promise<CatalogPageResult<typeof workspaceAssets.$inferSelect>> {
  const limit = boundCatalogLimit(page.limit);
  const cursorWhere = page.cursor
    ? or(
        lt(workspaceAssets.createdAt, page.cursor.at),
        and(eq(workspaceAssets.createdAt, page.cursor.at), lt(workspaceAssets.id, page.cursor.id)),
      )
    : undefined;
  const rows = await db
    .select()
    .from(workspaceAssets)
    .where(cursorWhere
      ? and(eq(workspaceAssets.source, "curated_inspiration"), cursorWhere)
      : eq(workspaceAssets.source, "curated_inspiration"))
    .orderBy(desc(workspaceAssets.createdAt), desc(workspaceAssets.id))
    .limit(limit + 1);
  return takeCatalogPage(rows, limit, (row) => ({ at: row.createdAt, id: row.id }));
}

export async function getCuratedInspirationById(id: string) {
  const [row] = await db
    .select()
    .from(workspaceAssets)
    .where(
      and(
        eq(workspaceAssets.id, id),
        eq(workspaceAssets.source, "curated_inspiration")
      )
    )
    .limit(1);
  return row ?? null;
}

export async function getMaterializedCuratedInspiration(
  workspaceId: string,
  inspirationId: string
) {
  const [row] = await db
    .select()
    .from(workspaceAssets)
    .where(
      and(
        eq(workspaceAssets.workspaceId, workspaceId),
        eq(workspaceAssets.source, "curated_inspiration_copy"),
        sql`${workspaceAssets.metadata}->>'curatedInspirationId' = ${inspirationId}`
      )
    )
    .limit(1);
  return row ?? null;
}

export async function updateWorkspaceAsset(
  id: string,
  workspaceId: string,
  data: {
    name?: string;
    tags?: string[];
    aiDescription?: string;
    metadata?: Record<string, unknown>;
  }
) {
  const result = await db
    .update(workspaceAssets)
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.tags !== undefined && { tags: data.tags }),
      ...(data.aiDescription !== undefined && { aiDescription: data.aiDescription }),
      ...(data.metadata !== undefined && { metadata: data.metadata }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workspaceAssets.id, id),
        eq(workspaceAssets.workspaceId, workspaceId)
      )
    )
    .returning();
  return result[0] ?? null;
}

export async function deleteWorkspaceAsset(id: string, workspaceId: string) {
  const result = await db
    .delete(workspaceAssets)
    .where(
      and(
        eq(workspaceAssets.id, id),
        eq(workspaceAssets.workspaceId, workspaceId)
      )
    )
    .returning();
  return result[0] ?? null;
}

export async function isWorkspaceAssetKey(workspaceId: string, key: string) {
  const result = await db
    .select({ id: workspaceAssets.id })
    .from(workspaceAssets)
    .where(
      and(
        eq(workspaceAssets.workspaceId, workspaceId),
        eq(workspaceAssets.key, key)
      )
    )
    .limit(1);
  return result.length > 0;
}
