import { eq, and, desc, sql, count, notInArray, or, lt, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { workspaceAssets, clientProfiles } from "../db/schema";
import { classifyLibraryAsset } from "@/lib/library-asset-kind";
import {
  boundCatalogLimit,
  takeCatalogPage,
  type CatalogQuery,
  type CatalogPageResult,
} from "@/lib/catalog-page";

export interface CreateWorkspaceAssetInput {
  workspaceId: string;
  clientProfileId?: string | null;
  name: string;
  key: string;
  type: string;
  size: number;
  width?: number;
  height?: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

export async function createWorkspaceAsset(data: CreateWorkspaceAssetInput, executor: Pick<typeof db, "insert"> = db) {
  const result = await executor
    .insert(workspaceAssets)
    .values({
      workspaceId: data.workspaceId,
      clientProfileId: data.clientProfileId ?? null,
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
      clientProfileId: data.clientProfileId ?? null,
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
  clientProfileId?: string;
  kind?: "identity" | "images" | "post" | "page";
  query?: string;
  tags?: string[];
  type?: string;
  source?: string;
  excludeSources?: string[];
}

function libraryAssetKind(workspaceId: string, clientProfileId?: string) {
  const tagged = (tags: string[]) => sql`exists (select 1 from jsonb_array_elements_text(coalesce(${workspaceAssets.tags}, '[]'::jsonb)) as tag(value) where lower(tag.value) in (${sql.join(tags.map(tag => sql`${tag}`), sql`, `)}))`;
  return classifyLibraryAsset({
    logo: sql`(${workspaceAssets.key} in (select ${clientProfiles.logoAssetKey} from ${clientProfiles}
      where ${clientProfiles.workspaceId} = ${workspaceId} and ${clientProfiles.id} = ${clientProfileId ?? workspaceAssets.clientProfileId})
      OR ${workspaceAssets.metadata}->>'kind' like '%logo%' OR ${workspaceAssets.metadata}->>'kind' = 'instagram_avatar')`,
    page: sql`${workspaceAssets.metadata}->>'kind' = 'site_page'`,
    post: sql`${workspaceAssets.source} = 'brand_instagram'`,
    generated: sql`(${workspaceAssets.source} = 'creative_work' OR ${tagged(["generated"])})`,
    legacyLogo: sql`(lower(${workspaceAssets.metadata}->>'category') = 'logo' OR ${tagged(["logo"])} OR lower(${workspaceAssets.name}) like '%logo%')`,
    photo: sql`(lower(${workspaceAssets.metadata}->>'category') in ('person', 'landscape', 'product') OR ${tagged(["photo", "photography"])})`,
  }, (cases, fallback) => sql`case ${sql.join(cases.map(([condition, kind]) => sql`when ${condition} then ${kind}`), sql` `)} else ${fallback} end`);
}

function buildAssetConditions(workspaceId: string, options: WorkspaceAssetFilters) {
  const conditions = [eq(workspaceAssets.workspaceId, workspaceId)];

  if (options.clientProfileId) {
    conditions.push(or(eq(workspaceAssets.clientProfileId, options.clientProfileId), isNull(workspaceAssets.clientProfileId))!);
  }
  conditions.push(sql`coalesce(${workspaceAssets.metadata}->>'provisional', 'false') <> 'true'`);
  if (options.kind) {
    const kind = libraryAssetKind(workspaceId, options.clientProfileId);
    const isLogo = sql`${kind} = 'logo'`;
    if (options.kind === "identity") conditions.push(sql`(${isLogo} OR ${workspaceAssets.type} like 'font/%')`);
    else if (options.kind === "page") conditions.push(sql`${kind} = 'page'`);
    else {
      conditions.push(sql`(${workspaceAssets.type} like 'image/%' OR ${workspaceAssets.type} = 'image') AND NOT coalesce(${isLogo}, false)`);
      if (options.kind === "post") conditions.push(sql`${kind} = 'post'`);
      else conditions.push(sql`${kind} not in ('post', 'page')`);
    }
  }

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
    .orderBy(...(options.kind === "identity" ? [
      desc(sql`coalesce(${workspaceAssets.key} = (select ${clientProfiles.logoAssetKey} from ${clientProfiles}
        where ${clientProfiles.workspaceId} = ${workspaceId} and ${clientProfiles.id} = ${options.clientProfileId ?? workspaceAssets.clientProfileId}), false)`),
      desc(sql`${libraryAssetKind(workspaceId, options.clientProfileId)} = 'logo'`),
    ] : []), desc(workspaceAssets.createdAt))
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

export async function getWorkspaceAssetsByKeys(workspaceId: string, keys: readonly string[]) {
  const uniqueKeys = [...new Set(keys)];
  if (uniqueKeys.length === 0) return [];
  return db
    .select()
    .from(workspaceAssets)
    .where(and(
      eq(workspaceAssets.workspaceId, workspaceId),
      inArray(workspaceAssets.key, uniqueKeys),
    ));
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
  inspirationId: string,
  clientProfileId?: string,
) {
  const [row] = await db
    .select()
    .from(workspaceAssets)
    .where(
      and(
        eq(workspaceAssets.workspaceId, workspaceId),
        eq(workspaceAssets.source, "curated_inspiration_copy"),
        clientProfileId ? eq(workspaceAssets.clientProfileId, clientProfileId) : undefined,
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
      ...(data.metadata !== undefined && { metadata: sql`coalesce(${workspaceAssets.metadata}, '{}'::jsonb) || ${JSON.stringify(data.metadata)}::jsonb` }),
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

export async function assignWorkspaceAssetBrand(id: string, workspaceId: string, clientProfileId: string) {
  const [asset] = await db.update(workspaceAssets)
    .set({ clientProfileId, updatedAt: new Date() })
    .where(and(
      eq(workspaceAssets.id, id), eq(workspaceAssets.workspaceId, workspaceId),
      isNull(workspaceAssets.clientProfileId),
      sql`coalesce(${workspaceAssets.metadata}->>'provisional', 'false') <> 'true'`,
      sql`exists (select 1 from ${clientProfiles} where ${clientProfiles.id} = ${clientProfileId} and ${clientProfiles.workspaceId} = ${workspaceId})`,
    )).returning();
  return asset ?? null;
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
