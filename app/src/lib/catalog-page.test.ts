import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CATALOG_CURSOR_INDEXES,
  CATALOG_CURSOR_INDEX_PLAN,
  CATALOG_PAGE_DEFAULT_LIMIT,
  decodeCatalogCursor,
  encodeCatalogCursor,
  parseCatalogPageSearchParams,
  resolveCatalogPage,
  takeCatalogPage,
} from "./catalog-page";

const id = "550e8400-e29b-41d4-a716-446655440001";

describe("catalog page", () => {
  it("defaults to a bounded page when the client omits limit", () => {
    const page = parseCatalogPageSearchParams(new URLSearchParams());
    expect(page.limit).toBe(CATALOG_PAGE_DEFAULT_LIMIT);
    expect(page.cursor).toBeNull();
    expect(page.error).toBeNull();
  });

  it("rejects a limit above the catalog cap", () => {
    expect(resolveCatalogPage({ limit: 500 }).error).toMatch(/limit/);
  });

  it("round-trips a date/id cursor", () => {
    const encoded = encodeCatalogCursor({ at: new Date("2026-09-06T12:00:00.000Z"), id });
    expect(decodeCatalogCursor(encoded)).toEqual({
      at: new Date("2026-09-06T12:00:00.000Z"),
      id,
    });
  });

  it("returns nextCursor only when extra rows exist", () => {
    const rows = [
      { id: "550e8400-e29b-41d4-a716-446655440001", updatedAt: new Date("2026-09-06T12:00:00.000Z") },
      { id: "550e8400-e29b-41d4-a716-446655440002", updatedAt: new Date("2026-09-05T12:00:00.000Z") },
      { id: "550e8400-e29b-41d4-a716-446655440003", updatedAt: new Date("2026-09-04T12:00:00.000Z") },
    ];
    const page = takeCatalogPage(rows, 2, (row) => ({ at: row.updatedAt, id: row.id }));
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeTruthy();
    expect(decodeCatalogCursor(page.nextCursor!)?.id).toBe(rows[1].id);
  });

  it("walks thousands of brand-scoped records without duplicates, gaps, or mixed brands", () => {
    const uuid = (index: number) => `550e8400-e29b-41d4-a716-${String(index).padStart(12, "0")}`;
    const rows = Array.from({ length: 3000 }, (_, index) => ({
      id: uuid(index),
      brandId: index < 2500 ? "brand-a" : "brand-b",
      updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, index)),
    }));
    const brandA = rows.filter((row) => row.brandId === "brand-a");
    const seen = new Set<string>();
    const collected: typeof brandA = [];
    let cursor: ReturnType<typeof decodeCatalogCursor> = null;

    const afterCursor = (items: typeof brandA) => {
      const sorted = [...items].sort((left, right) => {
        const time = right.updatedAt.getTime() - left.updatedAt.getTime();
        if (time !== 0) return time;
        return right.id.localeCompare(left.id);
      });
      const current = cursor;
      if (!current) return sorted;
      return sorted.filter((row) => {
        const time = row.updatedAt.getTime() - current.at.getTime();
        if (time !== 0) return time < 0;
        return row.id < current.id;
      });
    };

    for (let pageIndex = 0; pageIndex < 200; pageIndex += 1) {
      const fetched = afterCursor(brandA).slice(0, CATALOG_PAGE_DEFAULT_LIMIT + 1);
      const page = takeCatalogPage(fetched, CATALOG_PAGE_DEFAULT_LIMIT, (row) => ({
        at: row.updatedAt,
        id: row.id,
      }));
      expect(page.items.length).toBeLessThanOrEqual(CATALOG_PAGE_DEFAULT_LIMIT);
      expect(page.items.every((row) => row.brandId === "brand-a")).toBe(true);
      for (const item of page.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
        collected.push(item);
      }
      if (!page.nextCursor) break;
      cursor = decodeCatalogCursor(page.nextCursor);
      expect(cursor).not.toBeNull();
    }

    expect(collected).toHaveLength(brandA.length);
    expect([...seen].sort()).toEqual(brandA.map((row) => row.id).sort());
  });

  it("documents the cursor index walk used by templates and inspirations", () => {
    expect(CATALOG_CURSOR_INDEX_PLAN.templates).toEqual(["workspace_id", "updated_at DESC", "id DESC"]);
    expect(CATALOG_CURSOR_INDEX_PLAN.curatedInspirations).toEqual(["source", "created_at DESC", "id DESC"]);
  });

  it("ships btree indexes matching the catalog cursor walk", () => {
    const schema = readFileSync(path.resolve(__dirname, "../server/db/schema.ts"), "utf8");
    const migration = readFileSync(path.resolve(__dirname, "../../drizzle/0091_catalog_cursor_indexes.sql"), "utf8");
    expect(schema).toContain(CATALOG_CURSOR_INDEXES.templates);
    expect(schema).toContain(CATALOG_CURSOR_INDEXES.curatedInspirations);
    expect(migration).toContain(CATALOG_CURSOR_INDEXES.templates);
    expect(migration).toContain(CATALOG_CURSOR_INDEXES.curatedInspirations);
  });

  it("keeps exact template and inspiration lookups independent of the page window", () => {
    const templateRepo = readFileSync(path.resolve(__dirname, "../server/repositories/template.ts"), "utf8");
    const assetRepo = readFileSync(path.resolve(__dirname, "../server/repositories/workspace-asset.ts"), "utf8");
    expect(templateRepo).toMatch(/export async function getTemplateById/);
    expect(assetRepo).toMatch(/export async function getCuratedInspirationById/);
    expect(assetRepo).toMatch(/export async function getWorkspaceAssetById/);
  });

  it("explains the catalog cursor walk through the btree indexes on postgres", async () => {
    const url = process.env.DATABASE_URL;
    if (!url) return;
    const { Client } = await import("pg");
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const indexes = await client.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes WHERE schemaname = 'adscale_app' AND indexname = ANY($1)`,
        [[CATALOG_CURSOR_INDEXES.templates, CATALOG_CURSOR_INDEXES.curatedInspirations]],
      );
      if (indexes.rows.length !== 2) {
        throw new Error("0091 catalog cursor indexes are missing from adscale_app");
      }
      expect(indexes.rows.map((row) => row.indexname).sort()).toEqual([
        CATALOG_CURSOR_INDEXES.curatedInspirations,
        CATALOG_CURSOR_INDEXES.templates,
      ].sort());

      await client.query("SET enable_seqscan = off");
      const explain = async (sql: string) => {
        const result = await client.query(sql);
        return result.rows.map((row) => String(Object.values(row)[0])).join("\n");
      };
      const templates = await explain(
        "EXPLAIN SELECT id FROM adscale_app.campaign_templates WHERE workspace_id = '00000000-0000-4000-8000-000000000001' ORDER BY updated_at DESC, id DESC LIMIT 25",
      );
      const inspirations = await explain(
        "EXPLAIN SELECT id FROM adscale_app.workspace_assets WHERE source = 'curated_inspiration' ORDER BY created_at DESC, id DESC LIMIT 25",
      );
      expect(templates).not.toMatch(/Seq Scan/);
      expect(inspirations).not.toMatch(/Seq Scan/);
      expect(templates).toMatch(/Index Scan|Index Only Scan|Bitmap Index Scan/);
      expect(inspirations).toMatch(/Index Scan|Index Only Scan|Bitmap Index Scan/);
    } finally {
      await client.end();
    }
  });
});
