import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const MIGRATION_PATH = path.resolve(__dirname, "../../../drizzle/0087_credit_unit_v2.sql");
const JOURNAL_PATH = path.resolve(__dirname, "../../../drizzle/meta/_journal.json");

const EXPECTED_CREDIT_ACTIONS = [
  "creative_plan",
  "image_derivation",
  "regeneration",
  "restyling",
  "delivery_package_child",
  "landing_page",
  "creative_qa",
  "copy_generation",
  "personaSimulation",
] as const;

const FORBIDDEN_TECHNICAL_TYPES = [
  "layerize_quota",
  "generation_dispatch_ack",
] as const;

describe("0087_credit_unit_v2 migration", () => {
  it("migration file exists and is non-empty", () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql.trim().length).toBeGreaterThan(0);
  });

  it("contains integer overflow guard in a DO block before updates", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/DO\s+\$\$/i);
    expect(sql).toContain("214748364");
    expect(sql).toMatch(/credit_grants/i);
    expect(sql).toMatch(/credit_transactions/i);
    expect(sql).toMatch(/usage_events/i);
  });

  it("scales credit_grants amount and remaining by 10x", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/UPDATE\s+["`]?adscale_app["`]?\.["`]?credit_grants["`]?/i);
    expect(sql).toMatch(/["`]?amount["`]?\s*=\s*["`]?amount["`]?\s*\*\s*10/i);
    expect(sql).toMatch(/["`]?remaining["`]?\s*=\s*["`]?remaining["`]?\s*\*\s*10/i);
  });

  it("scales credit_transactions amount by 10x", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/UPDATE\s+["`]?adscale_app["`]?\.["`]?credit_transactions["`]?/i);
    expect(sql).toMatch(/["`]?amount["`]?\s*=\s*["`]?amount["`]?\s*\*\s*10/i);
  });

  it("scales usage_events for all 9 credit action types and excludes technical types", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/UPDATE\s+["`]?adscale_app["`]?\.["`]?usage_events["`]?/i);

    // Extract the WHERE type IN (...) clause from the usage_events update
    const usageUpdateMatch = sql.match(
      /UPDATE\s+["`]?adscale_app["`]?\.["`]?usage_events["`]?[\s\S]*?WHERE[\s\S]*?;/i
    );
    expect(usageUpdateMatch).toBeTruthy();
    const usageUpdateSql = usageUpdateMatch![0];

    for (const action of EXPECTED_CREDIT_ACTIONS) {
      expect(usageUpdateSql).toContain(`'${action}'`);
    }

    for (const techType of FORBIDDEN_TECHNICAL_TYPES) {
      expect(usageUpdateSql).not.toContain(`'${techType}'`);
    }
  });

  it("updates beta_analytics_events for credit_spend and credit_blocked with jsonb_set and creditUnitVersion 2", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/UPDATE\s+["`]?adscale_app["`]?\.["`]?beta_analytics_events["`]?/i);
    expect(sql).toContain("'credit_spend'");
    expect(sql).toContain("'credit_blocked'");
    expect(sql).toContain("jsonb_set");
    expect(sql).toContain("jsonb_typeof");
    expect(sql).toContain("creditUnitVersion");
    expect(sql).toContain("'2'");
    expect(sql).toContain("estimateCredits");
    expect(sql).toContain("actualCredits");
    expect(sql).toContain("creditDelta");
  });

  it("is registered in drizzle journal metadata", () => {
    expect(fs.existsSync(JOURNAL_PATH)).toBe(true);
    const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf-8"));
    const entry87 = journal.entries.find((e: { idx: number }) => e.idx === 87);
    expect(entry87).toBeDefined();
    expect(entry87.tag).toBe("0087_credit_unit_v2");
    expect(entry87.version).toBe("7");
    expect(typeof entry87.when).toBe("number");
    const entry86 = journal.entries.find((e: { idx: number }) => e.idx === 86);
    expect(entry87.when).toBeGreaterThan(entry86.when);
  });
});
