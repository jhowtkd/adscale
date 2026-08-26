import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

function migrationStatements(file: string, schema: string) {
  return readFileSync(resolve(process.cwd(), "drizzle", file), "utf8")
    .replaceAll('"adscale_app"', `"${schema}"`)
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

describeWithDatabase("credit migrations against disposable PostgreSQL fixtures", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDatabaseUrl });
  });

  afterAll(async () => {
    await pool.end();
  });

  async function withDisposableSchema(run: (schema: string) => Promise<void>) {
    const schema = `credit_migration_${randomUUID().replaceAll("-", "")}`;
    await pool.query(`CREATE SCHEMA "${schema}"`);
    try {
      await run(schema);
    } finally {
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
  }

  it("scales only credit data and preserves technical usage", async () => {
    await withDisposableSchema(async (schema) => {
      await pool.query(`
        CREATE TABLE "${schema}"."credit_grants" ("amount" integer NOT NULL, "remaining" integer NOT NULL);
        CREATE TABLE "${schema}"."credit_transactions" ("amount" integer NOT NULL);
        CREATE TABLE "${schema}"."usage_events" ("type" text NOT NULL, "amount" integer NOT NULL);
        CREATE TABLE "${schema}"."beta_analytics_events" ("event_key" text NOT NULL, "properties" jsonb NOT NULL);
      `);
      await pool.query(`
        INSERT INTO "${schema}"."credit_grants" VALUES (50, 40);
        INSERT INTO "${schema}"."credit_transactions" VALUES (-5);
        INSERT INTO "${schema}"."usage_events" VALUES ('creative_plan', 1), ('layerize_quota', 7);
        INSERT INTO "${schema}"."beta_analytics_events" VALUES
          ('credit_spend', '{"estimateCredits":5,"actualCredits":4,"creditDelta":-1,"keep":"yes"}'),
          ('readiness_completed', '{"estimateCredits":9,"keep":"yes"}');
      `);

      for (const statement of migrationStatements("0088_credit_unit_v2.sql", schema)) {
        await pool.query(statement);
      }

      const grants = await pool.query(`SELECT amount, remaining FROM "${schema}"."credit_grants"`);
      const transactions = await pool.query(`SELECT amount FROM "${schema}"."credit_transactions"`);
      const usage = await pool.query(`SELECT type, amount FROM "${schema}"."usage_events" ORDER BY type`);
      const analytics = await pool.query(`SELECT event_key, properties FROM "${schema}"."beta_analytics_events" ORDER BY event_key`);

      expect(grants.rows).toEqual([{ amount: 500, remaining: 400 }]);
      expect(transactions.rows).toEqual([{ amount: -50 }]);
      expect(usage.rows).toEqual([
        { type: "creative_plan", amount: 10 },
        { type: "layerize_quota", amount: 7 },
      ]);
      expect(analytics.rows).toEqual([
        {
          event_key: "credit_spend",
          properties: {
            actualCredits: 40,
            creditDelta: -10,
            creditUnitVersion: 2,
            estimateCredits: 50,
            keep: "yes",
          },
        },
        {
          event_key: "readiness_completed",
          properties: { estimateCredits: 9, keep: "yes" },
        },
      ]);
    });
  });

  it("serializes concurrent grants for the same source id", async () => {
    await withDisposableSchema(async (schema) => {
      await pool.query(`CREATE TABLE "${schema}"."credit_grants" ("source" text NOT NULL, "source_id" text)`);
      for (const statement of migrationStatements("0089_credit_grant_source_idempotency.sql", schema)) {
        await pool.query(statement);
      }

      await Promise.all([
        pool.query(`INSERT INTO "${schema}"."credit_grants" VALUES ('stripe_invoice', 'in_123') ON CONFLICT DO NOTHING`),
        pool.query(`INSERT INTO "${schema}"."credit_grants" VALUES ('stripe_invoice', 'in_123') ON CONFLICT DO NOTHING`),
      ]);

      const result = await pool.query(`SELECT count(*)::integer AS count FROM "${schema}"."credit_grants"`);
      expect(result.rows).toEqual([{ count: 1 }]);
    });
  });
});
