import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { BRAND_TRAINING_REVIEW_STATUSES } from "./contracts";

const DRIZZLE = path.resolve(__dirname, "../../../drizzle");
const TAG = "0135_analysis_failed_brand_training_assets";

describe("migration 0135 (analysis_failed)", () => {
  it("is registered in the drizzle journal as idx 135, after 0134", () => {
    const journal = JSON.parse(fs.readFileSync(path.join(DRIZZLE, "meta/_journal.json"), "utf-8"));
    const entry = journal.entries.find((e: { tag: string }) => e.tag === TAG);
    expect(entry?.idx).toBe(135);
    const prev = journal.entries.find((e: { idx: number }) => e.idx === 134);
    expect(entry.when).toBeGreaterThan(prev.when);
    expect(journal.entries.filter((e: { idx: number }) => e.idx === 135)).toHaveLength(1);
  });

  it("recreates the review_status CHECK with every contract status, idempotently", () => {
    const sql = fs.readFileSync(path.join(DRIZZLE, `${TAG}.sql`), "utf-8");
    expect(sql).toContain("client_references_review_status_check");
    for (const status of BRAND_TRAINING_REVIEW_STATUSES) {
      expect(sql).toContain(`'${status}'`);
    }
    expect(sql).toContain("'analysis_failed'");
    expect(sql).toMatch(/IF EXISTS/);
    expect(sql).toMatch(/IF NOT EXISTS/);
  });
});
