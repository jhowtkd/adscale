/**
 * Keyset pagination over `(created_at DESC, id DESC)` with an opaque,
 * versioned cursor (#497, #503).
 *
 * `at` keeps the column's microseconds, read in SQL with
 * `KEYSET_AT_SQL_FORMAT`. A JS `Date` would truncate it to milliseconds and
 * skip rows written in the same millisecond, so the cursor never goes through
 * `Date` (precedent: `creative-production.ts`; `catalog-page.ts` keeps its
 * own millisecond cursor).
 *
 * The cursor only carries a position. Scope and filters are always reapplied
 * by the server from the session and the URL.
 */
import { sql, type AnyColumn, type SQL } from "drizzle-orm";

export const KEYSET_CURSOR_VERSION = 1;

/** `to_char` pattern that renders `created_at` with its microseconds. */
export const KEYSET_AT_SQL_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"';

export type KeysetCursor = {
  /** `created_at` with six fractional digits, e.g. `2026-10-21T12:34:56.123456Z`. */
  at: string;
  id: string;
};

export type KeysetPageRequest = {
  limit: number;
  cursor: KeysetCursor | null;
};

export type KeysetPage<T> = {
  items: T[];
  nextCursor: string | null;
};

const AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT_PATTERN = /^\d+$/;

function isValidAt(value: string): boolean {
  if (!AT_PATTERN.test(value)) return false;
  // Range-check the calendar and clock through the millisecond prefix: an
  // impossible instant (Feb 31, 25:00) or year 0, which JS accepts and Postgres
  // does not, would otherwise reach the SQL cast and answer 500.
  const millis = value.slice(0, 23);
  const parsed = new Date(`${millis}Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.getUTCFullYear() >= 1 &&
    parsed.toISOString().slice(0, 23) === millis
  );
}

export function encodeKeysetCursor(cursor: KeysetCursor): string {
  return Buffer.from(
    JSON.stringify({ v: KEYSET_CURSOR_VERSION, at: cursor.at, id: cursor.id }),
  ).toString("base64url");
}

/** Returns null for a malformed cursor or an unknown version. */
export function decodeKeysetCursor(value: string): KeysetCursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { v, at, id } = parsed as { v?: unknown; at?: unknown; id?: unknown };
  if (v !== KEYSET_CURSOR_VERSION) return null;
  if (typeof at !== "string" || !isValidAt(at)) return null;
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) return null;
  return { at, id };
}

/**
 * Reads `limit` and `cursor` from the query string. Returns null when `limit`
 * is not an integer inside `1..maxLimit` or the cursor is invalid; callers
 * answer 400 `invalidInput`.
 */
export function parseKeysetPageParams(
  params: URLSearchParams,
  bounds: { defaultLimit: number; maxLimit: number },
): KeysetPageRequest | null {
  const rawLimit = params.get("limit");
  let limit = bounds.defaultLimit;
  if (rawLimit !== null) {
    if (!LIMIT_PATTERN.test(rawLimit)) return null;
    limit = Number(rawLimit);
    if (limit < 1 || limit > bounds.maxLimit) return null;
  }
  const rawCursor = params.get("cursor");
  if (!rawCursor) return { limit, cursor: null };
  const cursor = decodeKeysetCursor(rawCursor);
  return cursor ? { limit, cursor } : null;
}

/** `created_at` with its microseconds; select it as `sortAt` for `takeKeysetPage`. */
export function keysetSortAt(createdAt: AnyColumn): SQL<string> {
  return sql<string>`to_char(${createdAt}, ${sql.raw(`'${KEYSET_AT_SQL_FORMAT}'`)})`;
}

/** Rows strictly after the cursor in `(created_at DESC, id DESC)` order. */
export function keysetAfter(
  createdAt: AnyColumn,
  id: AnyColumn,
  cursor: KeysetCursor | null,
): SQL | undefined {
  return cursor
    ? sql`(${createdAt}, ${id}) < (${cursor.at}::timestamp, ${cursor.id}::uuid)`
    : undefined;
}

/**
 * Cuts rows fetched with `limit + 1` into one page. `nextCursor` points at the
 * last returned row, or is null when there is no further row.
 */
export function takeKeysetPage<T extends { id: string; sortAt: string }>(
  rows: T[],
  limit: number,
): KeysetPage<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? encodeKeysetCursor({ at: last.sortAt, id: last.id }) : null,
  };
}
