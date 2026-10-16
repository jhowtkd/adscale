import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { main } from "./jev-retain";
import * as schema from "../src/server/db/schema";
import { SEMANTIC_REVIEW_VERSIONS, createSemanticReviewRepository } from "../src/server/creative-work/semantic-review-repository";
import { collectSemanticReview } from "../src/server/creative-work/semantic-review-collector";
import {
  DAY_MS, assertSafeTestDatabaseUrl, claimHermeticClock, createScope, deleteScopes, insertWorks,
  openTestDatabase, policyInput, type Scope,
} from "../src/server/creative-work/semantic-review-collection.pg-helpers";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const SAFE_URL = "postgres://test:test@localhost:5433/adscale_test";

describe("Jev retention CLI guards", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  const invalid: string[][] = [
    [], ["unknown"], ["expire"], ["expire", "--workspace"], ["expire", "--workspace", "not-a-uuid"],
    ["expire", "--workspace", WORKSPACE, "--apply"], ["expire", "--workspace", WORKSPACE, "extra"],
    ["expire", "--workspace", WORKSPACE, "--workspace", WORKSPACE],
    ["cleanup"], ["cleanup", "--apply"], ["cleanup", "--workspace", WORKSPACE, "--apply", "--apply"],
    ["cleanup", "--workspace", WORKSPACE, "--apply", "extra"], ["cleanup", "--workspace", WORKSPACE, "--limit", "1"],
    ["cleanup", "--workspace", "--apply"], ["demo", "extra"], ["demo", "--workspace", WORKSPACE],
  ];

  it.each(invalid)("rejects arguments %j as invalid_arguments before reading the environment or connecting", async (...args) => {
    // No env at all: if the database guard ran first, the error would be explicit_test_database_required.
    vi.stubEnv("TEST_DATABASE_URL", "");
    const fetchSentinel = vi.fn();
    vi.stubGlobal("fetch", fetchSentinel);
    await expect(main(args)).rejects.toThrow("invalid_arguments");
    vi.stubEnv("TEST_DATABASE_URL", "postgres://u:secret@localhost:1/adscale_test");
    await expect(main(args)).rejects.toThrow("invalid_arguments");
    expect(fetchSentinel).not.toHaveBeenCalled();
  });

  it.each([["expire", "--workspace", WORKSPACE], ["cleanup", "--workspace", WORKSPACE], ["cleanup", "--workspace", WORKSPACE, "--apply"], ["demo"]])(
    "%j never falls back to DATABASE_URL", async (...args) => {
      vi.stubEnv("TEST_DATABASE_URL", "");
      vi.stubEnv("DATABASE_URL", SAFE_URL);
      await expect(main(args)).rejects.toThrow("explicit_test_database_required");
    });

  it.each([
    "postgres://u:p@db.example.com:5432/adscale_test",
    "postgres://u:p@localhost:5432/adscale",
    `${SAFE_URL}?sslmode=disable`,
    `${SAFE_URL}#x`,
    "mysql://test:test@localhost:5433/adscale_test",
  ])("refuses unsafe database %s for every command without any call", async (url) => {
    vi.stubEnv("TEST_DATABASE_URL", url);
    const fetchSentinel = vi.fn();
    vi.stubGlobal("fetch", fetchSentinel);
    for (const args of [["expire", "--workspace", WORKSPACE], ["cleanup", "--workspace", WORKSPACE, "--apply"], ["demo"]]) {
      await expect(main(args)).rejects.toThrow("unsafe_test_database");
    }
    expect(fetchSentinel).not.toHaveBeenCalled();
  });

  it("does not leak the connection string when the (safe-looking) database is unreachable", async () => {
    vi.stubEnv("TEST_DATABASE_URL", "postgres://user:topsecret@localhost:1/adscale_test");
    const error = await main(["cleanup", "--workspace", WORKSPACE]).then(() => null, (e: unknown) => e);
    expect(error).toBeTruthy();
    expect(JSON.stringify(String((error as Error).message))).not.toContain("topsecret");
  });

  it("the entrypoint prints only a safe code on invalid arguments", async () => {
    const run = promisify(execFile);
    const failure = await run("node", ["--conditions=react-server", "--import", "tsx", "scripts/jev-retain.ts", "cleanup", "--workspace", "x"],
      { cwd: process.cwd(), env: { PATH: process.env.PATH, TEST_DATABASE_URL: "postgres://u:topsecret@localhost:1/adscale_test" } }).then(() => null, (e: { stderr: string; code: number }) => e);
    expect(failure).toMatchObject({ code: 1 });
    expect(failure!.stderr.trim()).toBe("invalid_arguments");
  }, 60_000);
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("Jev retention CLI against the test database (PostgreSQL)", () => {
  const versions = SEMANTIC_REVIEW_VERSIONS as unknown as Record<string, string>;
  const globalFetch = vi.fn(() => { throw new Error("global_fetch_forbidden"); });

  it("expire / cleanup (dry run by default, blocked while the pilot window is open) / cleanup --apply, with a safe output", async () => {
    vi.stubGlobal("fetch", globalFetch);
    const { db, pool } = await openTestDatabase(assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL));
    const release = await claimHermeticClock(pool);
    const repository = createSemanticReviewRepository(db);
    const scopes: Scope[] = [];
    try {
      const s = await createScope(db, 1);
      scopes.push(s);
      const other = await createScope(db, 1);
      scopes.push(other);
      const seeded: Record<string, { base: string; policyId: string }> = {};
      for (const scope of [s, other]) {
        // Policy real-clock window: authorized in the past, still valid now (CLI uses the real clock).
        const policy = await repository.registerPolicy(policyInput(scope, versions, {
          authorizedAt: new Date(Date.now() - 3_600_000), expiresAt: new Date(Date.now() + 3_600_000) }) as never, new Date(Date.now() - 600_000));
        await repository.setPolicyEnabled({ workspaceId: scope.workspaceId, policyId: policy.id, enabled: true }, new Date());
        await insertWorks(db, scope, 1, { updatedAt: new Date(Date.now() - 300_000) });
        for (let i = 0; i < 4; i += 1) await collectSemanticReview({ repository, enabled: true, now: new Date() });
        const [base] = await db.select().from(schema.semanticReviewObservations).where(eq(schema.semanticReviewObservations.workspaceId, scope.workspaceId));
        expect(base).toBeTruthy();
        seeded[scope.workspaceId] = { base: base.id, policyId: policy.id };
      }
      const old = new Date(Date.now() - 31 * DAY_MS);
      const mutate = async (scope: Scope, values: Record<string, unknown>) => db.update(schema.semanticReviewObservations)
        .set(values as never).where(eq(schema.semanticReviewObservations.id, seeded[scope.workspaceId].base));
      // Overdue pending in `s`; the same in `other` must be left alone.
      for (const scope of [s, other]) await mutate(scope, { expiresAt: new Date(Date.now() - 1_000) });
      const expired = await main(["expire", "--workspace", s.workspaceId]);
      expect(expired).toMatchObject({ workspaceId: s.workspaceId, expired: 1, recovered: 0, outcomeUnknown: 0 });
      const rowOf = async (scope: Scope) => (await db.select().from(schema.semanticReviewObservations).where(eq(schema.semanticReviewObservations.workspaceId, scope.workspaceId)))[0];
      expect(await rowOf(s)).toMatchObject({ state: "skipped", errorCode: "queue_expired" });
      expect(await rowOf(other)).toMatchObject({ state: "queued" });

      await mutate(s, { createdAt: old });
      await db.insert(schema.semanticReviewQuotaDays).values({ workspaceId: s.workspaceId, dayUtc: "2020-01-01", attempts: 1 });
      // Window still open: safe blocked result, nothing deleted, quota not cleaned.
      const blocked = await main(["cleanup", "--workspace", s.workspaceId, "--apply"]) as Record<string, Record<string, unknown> | null>;
      expect(blocked.observations).toMatchObject({ status: "blocked_active_pilot_window", deleted: 0, observationIds: [] });
      expect(blocked.quota).toBeNull();
      expect(await rowOf(s)).toBeTruthy();
      expect(await db.select().from(schema.semanticReviewQuotaDays).where(eq(schema.semanticReviewQuotaDays.workspaceId, s.workspaceId))).toHaveLength(1);

      await repository.revokePolicy({ workspaceId: s.workspaceId, policyId: seeded[s.workspaceId].policyId }, new Date());
      const dry = await main(["cleanup", "--workspace", s.workspaceId]) as Record<string, Record<string, unknown> | null>;
      expect(dry.observations).toMatchObject({ status: "ready", mode: "dry_run", deleted: 0, observationIds: [seeded[s.workspaceId].base] });
      expect(dry.quota).toMatchObject({ mode: "dry_run", deleted: 0, dayUtc: ["2020-01-01"] });
      expect(await rowOf(s)).toBeTruthy();
      const applied = await main(["cleanup", "--workspace", s.workspaceId, "--apply"]) as Record<string, Record<string, unknown> | null>;
      expect(applied.observations).toMatchObject({ mode: "apply", deleted: 1 });
      expect(applied.quota).toMatchObject({ mode: "apply", deleted: 1 });
      expect(await rowOf(s)).toBeUndefined();
      expect(await rowOf(other)).toMatchObject({ state: "queued" });
      // Output carries ids and counters only.
      expect(JSON.stringify([expired, blocked, dry, applied])).not.toMatch(/topsecret|synthetic request|headline|Bearer/i);
      expect(globalFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      try {
        if (scopes.length) await db.delete(schema.semanticReviewPolicies).where(inArray(schema.semanticReviewPolicies.workspaceId, scopes.map((x) => x.workspaceId)));
        await deleteScopes(db, scopes);
      } finally { await release(); await pool.end(); }
    }
  }, 60_000);

  it("demo runs on the disposable database with zero real HTTP and leaves nothing behind", async () => {
    vi.stubGlobal("fetch", globalFetch);
    try {
      const before = await (async () => {
        const { pool } = await openTestDatabase(assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL));
        try { return (await pool.query("select count(*)::int as n from adscale_app.workspaces where slug like 'jev%'")).rows[0].n as number; } finally { await pool.end(); }
      })();
      const result = await main(["demo"]);
      expect(result).toBeTruthy();
      expect(JSON.stringify(result)).not.toMatch(/Bearer|TYPESAFE|topsecret/);
      const { pool } = await openTestDatabase(assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL));
      try {
        expect((await pool.query("select count(*)::int as n from adscale_app.workspaces where slug like 'jev%'")).rows[0].n).toBe(before);
      } finally { await pool.end(); }
      expect(globalFetch).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  }, 60_000);
});
