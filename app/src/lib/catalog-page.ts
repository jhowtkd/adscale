export const CATALOG_PAGE_DEFAULT_LIMIT = 24;
export const CATALOG_PAGE_MAX_LIMIT = 48;

/** Intended btree walk for catalog cursors. Production EXPLAIN remains the live p95 proof. */
export const CATALOG_CURSOR_INDEX_PLAN = {
  templates: ["workspace_id", "updated_at DESC", "id DESC"],
  curatedInspirations: ["source", "created_at DESC", "id DESC"],
} as const;

export const CATALOG_CURSOR_INDEXES = {
  templates: "campaign_templates_catalog_cursor_idx",
  curatedInspirations: "workspace_assets_catalog_cursor_idx",
} as const;

export type CatalogCursor = {
  at: Date;
  id: string;
};

export type CatalogPageInput = {
  limit?: number;
  cursor?: string | null;
};

export type CatalogPageResult<T> = {
  items: T[];
  nextCursor: string | null;
};

export type ParsedCatalogPage = {
  limit: number;
  cursor: CatalogCursor | null;
  error: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCatalogCursor(cursor: CatalogCursor): string {
  return Buffer.from(JSON.stringify({
    at: cursor.at.toISOString(),
    id: cursor.id,
  })).toString("base64url");
}

export function decodeCatalogCursor(value: string): CatalogCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      at?: unknown;
      id?: unknown;
    };
    if (typeof parsed.at !== "string" || typeof parsed.id !== "string") return null;
    if (!UUID_PATTERN.test(parsed.id)) return null;
    const at = new Date(parsed.at);
    if (Number.isNaN(at.getTime())) return null;
    return { at, id: parsed.id };
  } catch {
    return null;
  }
}

export function resolveCatalogPage(input: CatalogPageInput = {}): ParsedCatalogPage {
  const requested = input.limit ?? CATALOG_PAGE_DEFAULT_LIMIT;
  if (!Number.isInteger(requested) || requested < 1 || requested > CATALOG_PAGE_MAX_LIMIT) {
    return { limit: CATALOG_PAGE_DEFAULT_LIMIT, cursor: null, error: "limit must be an integer between 1 and 48" };
  }
  if (!input.cursor) {
    return { limit: requested, cursor: null, error: null };
  }
  const cursor = decodeCatalogCursor(input.cursor);
  if (!cursor) {
    return { limit: requested, cursor: null, error: "cursor is invalid" };
  }
  return { limit: requested, cursor, error: null };
}

export function boundCatalogLimit(limit?: number): number {
  if (!Number.isInteger(limit) || !limit || limit < 1) return CATALOG_PAGE_DEFAULT_LIMIT;
  return Math.min(limit, CATALOG_PAGE_MAX_LIMIT);
}

export type CatalogQuery = {
  limit?: number;
  cursor?: CatalogCursor | null;
};

export function parseCatalogPageSearchParams(searchParams: URLSearchParams): ParsedCatalogPage {
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : CATALOG_PAGE_DEFAULT_LIMIT;
  return resolveCatalogPage({
    limit: Number.isFinite(limit) ? limit : Number.NaN,
    cursor: searchParams.get("cursor"),
  });
}

export function takeCatalogPage<T>(
  rows: T[],
  limit: number,
  cursorOf: (row: T) => CatalogCursor,
): CatalogPageResult<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? encodeCatalogCursor(cursorOf(last)) : null,
  };
}
