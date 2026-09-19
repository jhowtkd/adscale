import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

const MIGRATION_FILE = "0091_creative_work_carousels.sql";

function migrationStatements(file: string, schema: string) {
  return readFileSync(resolve(process.cwd(), "drizzle", file), "utf8")
    .replaceAll('"adscale_app"', `"${schema}"`)
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";

describeWithDatabase("creative work carousel migration against disposable PostgreSQL", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDatabaseUrl });
  });

  afterAll(async () => {
    await pool.end();
  });

  async function withDisposableSchema(run: (schema: string) => Promise<void>) {
    const schema = `carousel_migration_${randomUUID().replaceAll("-", "")}`;
    await pool.query(`CREATE SCHEMA "${schema}"`);
    try {
      await run(schema);
    } finally {
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
  }

  /** Pre-migration state: the legacy tool_kind check without `carousel`. */
  async function seedLegacySchema(schema: string) {
    await pool.query(`
      CREATE TABLE "${schema}"."workspaces" ("id" uuid PRIMARY KEY);
      CREATE TABLE "${schema}"."creative_work_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspace_id" uuid NOT NULL REFERENCES "${schema}"."workspaces"("id") ON DELETE CASCADE,
        "title" text NOT NULL,
        "tool_kind" text NOT NULL,
        CONSTRAINT "creative_work_items_tool_kind_check"
          CHECK ("tool_kind" IN ('social_post','variations','single','format_adaptation','restyle'))
      );
      CREATE TABLE "${schema}"."creative_work_outputs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "work_item_id" uuid NOT NULL REFERENCES "${schema}"."creative_work_items"("id") ON DELETE CASCADE
      );
    `);
  }

  async function applyMigration(schema: string) {
    for (const statement of migrationStatements(MIGRATION_FILE, schema)) {
      await pool.query(statement);
    }
  }

  async function insertWorkspace(schema: string): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO "${schema}"."workspaces" ("id") VALUES (gen_random_uuid()) RETURNING id`,
    );
    return result.rows[0]!.id;
  }

  async function insertWork(schema: string, workspaceId: string, toolKind: string): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO "${schema}"."creative_work_items" ("workspace_id", "title", "tool_kind")
       VALUES ($1, 'Trabalho sintetico', $2) RETURNING id`,
      [workspaceId, toolKind],
    );
    return result.rows[0]!.id;
  }

  interface SlideSeed {
    workspaceId: string;
    workItemId: string;
    lineageId?: string;
    parentSlideId?: string | null;
    versionNumber?: number;
    position?: number;
    role?: string;
    status?: string;
    layoutFamily?: string;
    copyAuthority?: string;
    generationOperationKey?: string;
    isCurrent?: boolean;
  }

  async function insertSlide(schema: string, seed: SlideSeed): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO "${schema}"."creative_work_carousel_slides" (
        "workspace_id", "work_item_id", "lineage_id", "parent_slide_id",
        "version_number", "deck_revision", "position", "role",
        "primary_text", "copy_authority", "layout_family", "status",
        "visual_contract_hash", "generation_operation_key", "is_current"
      ) VALUES ($1, $2, $3, $4, $5, 'deck-r1', $6, $7, 'Texto primario', $8, $9, $10, 'contract-hash', $11, $12)
      RETURNING id`,
      [
        seed.workspaceId,
        seed.workItemId,
        seed.lineageId ?? randomUUID(),
        seed.parentSlideId ?? null,
        seed.versionNumber ?? 1,
        seed.position ?? 1,
        seed.role ?? "hook",
        seed.copyAuthority ?? "ai_proposal",
        seed.layoutFamily ?? "impact",
        seed.status ?? "draft",
        seed.generationOperationKey ?? `op-${randomUUID()}`,
        seed.isCurrent ?? true,
      ],
    );
    return result.rows[0]!.id;
  }

  it("keeps the legacy single work unchanged and admits carousel without touching outputs", async () => {
    await withDisposableSchema(async (schema) => {
      await seedLegacySchema(schema);
      const workspaceId = await insertWorkspace(schema);
      const legacyWorkId = await insertWork(schema, workspaceId, "single");

      await applyMigration(schema);

      const legacy = await pool.query(
        `SELECT "tool_kind", "carousel_approved_revision", "carousel_quality"
         FROM "${schema}"."creative_work_items" WHERE "id" = $1`,
        [legacyWorkId],
      );
      expect(legacy.rows[0]).toEqual({
        tool_kind: "single",
        carousel_approved_revision: null,
        carousel_quality: null,
      });

      await expect(insertWork(schema, workspaceId, "carousel")).resolves.toBeDefined();
      await expect(
        pool.query(
          `INSERT INTO "${schema}"."creative_work_items" ("workspace_id", "title", "tool_kind")
           VALUES ($1, 'Invalido', 'bogus')`,
          [workspaceId],
        ),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });

      const outputColumns = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'creative_work_outputs'`,
        [schema],
      );
      expect(outputColumns.rows.map((row) => row.column_name).sort()).toEqual(["id", "work_item_id"]);
    });
  });

  it("keeps exactly one current version per lineage and position", async () => {
    await withDisposableSchema(async (schema) => {
      await seedLegacySchema(schema);
      await applyMigration(schema);
      const workspaceId = await insertWorkspace(schema);
      const workId = await insertWork(schema, workspaceId, "carousel");
      const lineageId = randomUUID();

      await insertSlide(schema, { workspaceId, workItemId: workId, lineageId, position: 1 });

      await expect(
        insertSlide(schema, { workspaceId, workItemId: workId, lineageId, position: 1 }),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });

      // A superseded row (is_current = false) frees the position so a new
      // current version can be created inside the same lineage.
      await pool.query(
        `UPDATE "${schema}"."creative_work_carousel_slides" SET "is_current" = false WHERE "work_item_id" = $1`,
        [workId],
      );
      await expect(
        insertSlide(schema, {
          workspaceId,
          workItemId: workId,
          lineageId,
          position: 1,
          versionNumber: 2,
        }),
      ).resolves.toBeDefined();
    });
  });

  it("rejects duplicate generation operation keys per work item", async () => {
    await withDisposableSchema(async (schema) => {
      await seedLegacySchema(schema);
      await applyMigration(schema);
      const workspaceId = await insertWorkspace(schema);
      const workId = await insertWork(schema, workspaceId, "carousel");

      await insertSlide(schema, { workspaceId, workItemId: workId, generationOperationKey: "shared-op" });

      await expect(
        insertSlide(schema, {
          workspaceId,
          workItemId: workId,
          position: 2,
          role: "context",
          layoutFamily: "development",
          generationOperationKey: "shared-op",
        }),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    });
  });

  it("rejects invalid statuses, roles, layout families and non-positive ordinals", async () => {
    await withDisposableSchema(async (schema) => {
      await seedLegacySchema(schema);
      await applyMigration(schema);
      const workspaceId = await insertWorkspace(schema);
      const workId = await insertWork(schema, workspaceId, "carousel");

      const rejects = (seed: SlideSeed) =>
        expect(insertSlide(schema, seed)).rejects.toMatchObject({ code: CHECK_VIOLATION });

      await rejects({ workspaceId, workItemId: workId, status: "weird" });
      await rejects({ workspaceId, workItemId: workId, role: "plot_twist" });
      await rejects({ workspaceId, workItemId: workId, layoutFamily: "banner" });
      await rejects({ workspaceId, workItemId: workId, copyAuthority: "stolen" });
      await rejects({ workspaceId, workItemId: workId, versionNumber: 0 });
      await rejects({ workspaceId, workItemId: workId, position: 0 });
    });
  });

  it("rejects a slide whose work belongs to another workspace", async () => {
    await withDisposableSchema(async (schema) => {
      await seedLegacySchema(schema);
      await applyMigration(schema);
      const workspaceA = await insertWorkspace(schema);
      const workspaceB = await insertWorkspace(schema);
      const workId = await insertWork(schema, workspaceA, "carousel");

      await expect(
        insertSlide(schema, { workspaceId: workspaceB, workItemId: workId }),
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });
  });

  it("rejects a slide that names itself as its own parent", async () => {
    await withDisposableSchema(async (schema) => {
      await seedLegacySchema(schema);
      await applyMigration(schema);
      const workspaceId = await insertWorkspace(schema);
      const workId = await insertWork(schema, workspaceId, "carousel");
      const slideId = randomUUID();

      await expect(
        pool.query(
          `INSERT INTO "${schema}"."creative_work_carousel_slides" (
             "id", "workspace_id", "work_item_id", "lineage_id", "parent_slide_id",
             "version_number", "deck_revision", "position", "role", "primary_text",
             "copy_authority", "layout_family", "visual_contract_hash", "generation_operation_key"
           ) VALUES ($1, $2, $3, $4, $1, 1, 'deck-r1', 1, 'hook', 'Texto', 'ai_proposal', 'impact', 'contract-hash', 'op-self')
           RETURNING id`,
          [slideId, workspaceId, workId, randomUUID()],
        ),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });
  });
});
