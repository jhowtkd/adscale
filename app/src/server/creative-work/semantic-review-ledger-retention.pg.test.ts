/**
 * #471 — retention of the collection-run ledger (cleanCollectionRuns) against real PostgreSQL.
 *
 * Public entries: repository.cleanCollectionRuns (retention repository, mixed into createSemanticReviewRepository),
 * the `jev:retain cleanup` CLI main, and the export reconstruction's historyComplete flag. Every row is synthetic;
 * ledger rows are inserted directly because only their age/shape matters here.
 *
 *   TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *     npx vitest run --config config/vitest.config.ts src/server/creative-work/semantic-review-ledger-retention.pg.test.ts
 *
 * Absent TEST_DATABASE_URL skips the suite — a skip is NOT evidence. Shares the #468 advisory lock + isolated clock.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import type { Pool } from "pg";
import * as schema from "../db/schema";
import { SEMANTIC_REVIEW_VERSIONS, createSemanticReviewRepository } from "./semantic-review-repository";
import { collectSemanticReview } from "./semantic-review-collector";
import { createSemanticReviewExportRepository } from "./semantic-review-export-repository";
import { semanticDigest } from "./semantic-review-evaluation";
import { main as retainMain } from "../../../scripts/jev-retain";
import {
  DAY_MS, T0, assertSafeTestDatabaseUrl, claimHermeticClock, createScope, deleteScopes, insertWorks, minutes,
  openTestDatabase, pgTimestamp, policyInput, type Scope, type TestDb,
} from "./semantic-review-collection.pg-helpers";

const URL_UNDER_TEST = process.env.TEST_DATABASE_URL;
const versions = SEMANTIC_REVIEW_VERSIONS as unknown as Record<string, string>;
const runsTable = schema.semanticReviewCollectionRuns;

type Summary = { workspaceId: string; mode: "dry_run" | "apply"; status: "ready" | "blocked_active_pilot_window"; cutoff: string; eligible: number; deleted: number; runIds: string[] };
type Clean = (input: Record<string, unknown>) => Promise<Summary>;

describe.skipIf(!URL_UNDER_TEST)("collection ledger retention (PostgreSQL)", () => {
  let db: TestDb;
  let pool: Pool;
  let releaseClock: () => Promise<void>;
  let repository: ReturnType<typeof createSemanticReviewRepository>;
  let cleanRuns: Clean;
  const scopes: Scope[] = [];
  const globalFetch = vi.fn(() => { throw new Error("global_fetch_forbidden"); });

  /** Far past the 14-day policy window, so seeded (non-revoked) policies are expired. */
  const CLEAN = () => new Date(T0.getTime() + 45 * DAY_MS);
  const cutoffOf = (now: Date) => new Date(now.getTime() - 30 * DAY_MS);
  const before = (ms: number, now = CLEAN()) => new Date(cutoffOf(now).getTime() - ms);

  const scope = async () => { const s = await createScope(db, 1); scopes.push(s); return s; };
  /** A policy whose window is closed by revocation: cleanup is allowed regardless of dates. */
  async function revokedPolicy(s: Scope) {
    const policy = await repository.registerPolicy(policyInput(s, versions) as never, T0);
    await repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: true }, T0);
    await repository.revokePolicy({ workspaceId: s.workspaceId, policyId: policy.id }, minutes(T0, 6));
    return policy.id;
  }
  async function insertRuns(s: Scope, policyId: string, specs: Array<Partial<typeof runsTable.$inferInsert>>) {
    const rows = specs.map((spec) => ({
      workspaceId: s.workspaceId, policyId, windowLower: pgTimestamp(T0), windowUpper: pgTimestamp(minutes(T0, 1)),
      status: "collected" as const, errorCode: null, consulted: 0, eligible: 0, unique: 0, duplicates: 0, outOfScope: 0, invalid: 0, notSampled: 0,
      exclusions: {}, windowComplete: true, initialPage: false, recordedAt: before(DAY_MS), ...spec,
    }));
    const ids: string[] = [];
    for (let start = 0; start < rows.length; start += 50) {
      ids.push(...(await db.insert(runsTable).values(rows.slice(start, start + 50)).returning({ id: runsTable.id })).map((r) => r.id));
    }
    return ids;
  }
  const remaining = async (s: Scope) => (await db.select().from(runsTable).where(eq(runsTable.workspaceId, s.workspaceId))).map((r) => r.id).sort();
  const clean = (s: Scope, extra: Record<string, unknown> = {}) => cleanRuns({ workspaceId: s.workspaceId, now: CLEAN(), ...extra });
  const withTimeout = <T,>(promise: Promise<T>, ms = 4_000) => Promise.race([promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("blocked_beyond_bound")), ms))]);
  const around = async (s: Scope) => JSON.stringify({
    works: await db.select().from(schema.creativeWorkItems).where(eq(schema.creativeWorkItems.workspaceId, s.workspaceId)).orderBy(schema.creativeWorkItems.id),
    observations: await db.select().from(schema.semanticReviewObservations).where(eq(schema.semanticReviewObservations.workspaceId, s.workspaceId)).orderBy(schema.semanticReviewObservations.id),
    quota: await db.select().from(schema.semanticReviewQuotaDays).where(eq(schema.semanticReviewQuotaDays.workspaceId, s.workspaceId)),
    policies: await db.select().from(schema.semanticReviewPolicies).where(eq(schema.semanticReviewPolicies.workspaceId, s.workspaceId)),
  });

  beforeAll(async () => {
    ({ db, pool } = await openTestDatabase(assertSafeTestDatabaseUrl(URL_UNDER_TEST)));
    releaseClock = await claimHermeticClock(pool);
    repository = createSemanticReviewRepository(db);
    cleanRuns = (repository as unknown as { cleanCollectionRuns: Clean }).cleanCollectionRuns.bind(repository);
  }, 120_000);
  beforeEach(() => { globalFetch.mockClear(); vi.stubGlobal("fetch", globalFetch); });
  afterEach(async () => {
    if (scopes.length) await db.delete(schema.semanticReviewPolicies).where(inArray(schema.semanticReviewPolicies.workspaceId, scopes.map((s) => s.workspaceId)));
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    expect(globalFetch).not.toHaveBeenCalled();
  });
  afterAll(async () => {
    if (!db) return;
    try { await deleteScopes(db, scopes); } finally { await releaseClock?.(); await pool.end(); }
  });

  describe("age floor and preview/apply", () => {
    it("treats 30 days as an exclusive floor: older is eligible, exactly 30 days and newer are kept", async () => {
      const s = await scope();
      const policyId = await revokedPolicy(s);
      const cutoff = cutoffOf(CLEAN());
      const [older, exact, newer, recent] = await insertRuns(s, policyId, [
        { recordedAt: new Date(cutoff.getTime() - 1) }, { recordedAt: cutoff }, { recordedAt: new Date(cutoff.getTime() + 1) }, { recordedAt: minutes(CLEAN(), -60) },
      ]);
      const preview = await clean(s);
      expect(preview).toMatchObject({ workspaceId: s.workspaceId, mode: "dry_run", status: "ready", cutoff: cutoff.toISOString(), eligible: 1, deleted: 0, runIds: [older] });
      expect(await remaining(s)).toEqual([older, exact, newer, recent].sort());
      const applied = await clean(s, { apply: true });
      expect(applied).toMatchObject({ mode: "apply", status: "ready", eligible: 1, deleted: 1, runIds: [older] });
      expect(await remaining(s)).toEqual([exact, newer, recent].sort());
      expect(await clean(s, { apply: true })).toMatchObject({ eligible: 0, deleted: 0, runIds: [] });   // idempotent
    });

    it("removes failed and collected pages alike once old, and keeps everything else around them intact", async () => {
      const s = await scope();
      const seeded = await (async () => {
        const policy = await repository.registerPolicy(policyInput(s, versions) as never, T0);
        await repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: true }, T0);
        await insertWorks(db, s, 2, { updatedAt: minutes(T0, 1) });
        for (let i = 0; i < 4; i += 1) await collectSemanticReview({ repository, enabled: true, now: minutes(T0, 5 + i) });
        await repository.revokePolicy({ workspaceId: s.workspaceId, policyId: policy.id }, minutes(T0, 20));
        return policy.id;
      })();
      await db.update(runsTable).set({ initialPage: false }).where(eq(runsTable.workspaceId, s.workspaceId));   // the real recent markers would anchor the policy
      // Real clock: the pages the collector just wrote are recent, only the two inserted ones are older than 30 days.
      const live = new Date(Date.now() + 3_600_000), stale = new Date(live.getTime() - 31 * DAY_MS);
      await insertRuns(s, seeded, [{ status: "failed", errorCode: "collection_page_failed", recordedAt: stale }, { status: "collected", recordedAt: stale }]);
      const snapshot = await around(s);
      const recordedBefore = (await remaining(s)).length;
      const applied = await clean(s, { apply: true, now: live });
      expect(applied.deleted).toBe(2);
      expect((await remaining(s)).length).toBe(recordedBefore - 2);   // the real, recent pages stay
      expect(await around(s)).toBe(snapshot);                          // Trabalho, observations, quota, policies untouched
    });

    it("never crosses workspaces", async () => {
      const a = await scope(), b = await scope();
      const [pa, pb] = [await revokedPolicy(a), await revokedPolicy(b)];
      const [ra] = await insertRuns(a, pa, [{}]);
      const [rb] = await insertRuns(b, pb, [{}, {}]);
      expect(await clean(a, { apply: true })).toMatchObject({ deleted: 1, runIds: [ra] });
      expect(await remaining(b)).toHaveLength(2);
      expect(await remaining(b)).toContain(rb);
      expect(await cleanRuns({ workspaceId: crypto.randomUUID(), now: CLEAN(), apply: true })).toMatchObject({ status: "ready", eligible: 0, deleted: 0 });
    });
  });

  describe("pilot window guard", () => {
    it("blocks while an authorization window is open (enabled or merely disabled) and allows revoked or expired windows", async () => {
      const s = await scope();
      const policy = await repository.registerPolicy(policyInput(s, versions) as never, T0);
      await repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: true }, T0);
      const [old] = await insertRuns(s, policy.id, [{ recordedAt: new Date(T0.getTime() - 40 * DAY_MS) }]);
      const inWindow = minutes(T0, 60);
      expect(await cleanRuns({ workspaceId: s.workspaceId, now: inWindow, apply: true })).toMatchObject({ status: "blocked_active_pilot_window", eligible: 0, deleted: 0, runIds: [] });
      await repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: false }, minutes(T0, 30));
      expect(await cleanRuns({ workspaceId: s.workspaceId, now: inWindow, apply: true })).toMatchObject({ status: "blocked_active_pilot_window", deleted: 0 });
      expect(await remaining(s)).toContain(old);
      // expired (not revoked): allowed
      expect(await cleanRuns({ workspaceId: s.workspaceId, now: CLEAN() })).toMatchObject({ status: "ready", eligible: 1, deleted: 0 });
      // revoked inside its window: allowed
      await repository.revokePolicy({ workspaceId: s.workspaceId, policyId: policy.id }, minutes(T0, 61));
      expect(await cleanRuns({ workspaceId: s.workspaceId, now: inWindow, apply: true })).toMatchObject({ status: "ready", eligible: 1, deleted: 1, runIds: [old] });
    });

    it("rechecks time and the window after locking: a clock that moves back leaves everything in place", async () => {
      const s = await scope();
      const policyId = await revokedPolicy(s);
      await insertRuns(s, policyId, [{}, {}]);
      let calls = 0;
      const clock = () => (++calls <= 2 ? CLEAN() : minutes(T0, 5));   // the post-lock reading is far earlier: nothing is old any more
      const summary = await cleanRuns({ workspaceId: s.workspaceId, now: CLEAN(), clock, apply: true });
      expect(summary).toMatchObject({ status: "ready", eligible: 0, deleted: 0, runIds: [] });
      expect(await remaining(s)).toHaveLength(2);
      await expect(cleanRuns({ workspaceId: s.workspaceId, now: CLEAN(), clock: () => new Date(Number.NaN) })).rejects.toThrow("invalid_clock");
    });
  });

  describe("limits and pagination", () => {
    it.each([[0], [101], [1.5], ["10"], [-1]])("rejects limit %s", async (limit) => {
      const s = await scope();
      await expect(clean(s, { limit })).rejects.toThrow("invalid_retention_scope");
    });
    it("rejects a malformed workspace, date or apply flag", async () => {
      await expect(cleanRuns({ workspaceId: "nope", now: CLEAN() })).rejects.toThrow("invalid_retention_scope");
      await expect(cleanRuns({ workspaceId: crypto.randomUUID(), now: "2026-01-01" })).rejects.toThrow("invalid_retention_scope");
      await expect(cleanRuns({ workspaceId: crypto.randomUUID(), now: CLEAN(), apply: "yes" })).rejects.toThrow("invalid_retention_scope");
    });

    it("pages oldest first with a default and maximum of 100 runs per call", async () => {
      const s = await scope();
      const policyId = await revokedPolicy(s);
      const ids = await insertRuns(s, policyId, Array.from({ length: 105 }, (_, i) => ({ recordedAt: before(200 * DAY_MS - i * 1000) })));
      const preview = await clean(s);
      expect(preview).toMatchObject({ eligible: 100, deleted: 0 });
      const first = await clean(s, { apply: true });
      expect(first).toMatchObject({ eligible: 100, deleted: 100 });
      expect(await remaining(s)).toHaveLength(5);
      expect(first.runIds).not.toContain(ids[104]);                      // the newest of the old runs waits for the next page
      expect(await clean(s, { apply: true })).toMatchObject({ eligible: 5, deleted: 5 });
      expect(await remaining(s)).toEqual([]);
    });

    it("honors a smaller limit and returns the oldest runs", async () => {
      const s = await scope();
      const policyId = await revokedPolicy(s);
      const ids = await insertRuns(s, policyId, [3, 2, 1, 4].map((n) => ({ recordedAt: before(n * DAY_MS) })));
      const summary = await clean(s, { limit: 2, apply: true });
      expect(summary).toMatchObject({ eligible: 2, deleted: 2 });
      expect(summary.runIds.sort()).toEqual([ids[0], ids[3]].sort());     // 4 and 3 days older than the cutoff
      expect(await remaining(s)).toEqual([ids[1], ids[2]].sort());
    });
  });

  describe("initial-page marker ordering", () => {
    it("removes the initial page before any later page of the same policy so a partial cleanup never looks complete", async () => {
      const s = await scope();
      const policyId = await revokedPolicy(s);
      const [initial, ...later] = await insertRuns(s, policyId, [
        { initialPage: true, recordedAt: before(10 * DAY_MS) },
        ...Array.from({ length: 4 }, (_, i) => ({ recordedAt: before((5 - i) * DAY_MS) })),
      ]);
      const preview = await clean(s, { limit: 3 });
      expect(preview).toMatchObject({ eligible: 1, deleted: 0, runIds: [initial] });   // later pages are excluded while the marker exists
      expect(await clean(s, { limit: 3, apply: true })).toMatchObject({ eligible: 1, deleted: 1, runIds: [initial] });
      expect(await remaining(s)).toEqual([...later].sort());
      expect(await clean(s, { apply: true })).toMatchObject({ eligible: 4, deleted: 4 });
    });

    it("keeps old later pages while a recent initial page still anchors the policy", async () => {
      const s = await scope();
      const policyId = await revokedPolicy(s);
      const [, ...later] = await insertRuns(s, policyId, [
        { initialPage: true, recordedAt: minutes(CLEAN(), -DAY_MS / 60_000) }, { recordedAt: before(3 * DAY_MS) }, { recordedAt: before(4 * DAY_MS) },
      ]);
      expect(await clean(s, { apply: true })).toMatchObject({ eligible: 0, deleted: 0 });
      expect(await remaining(s)).toHaveLength(3);
      expect(later).toHaveLength(2);
    });

    it("decides per policy: a policy without a marker is cleaned while another keeps its later pages", async () => {
      const s = await scope();
      const anchored = await revokedPolicy(s);
      const open = await revokedPolicy(s);
      const [marker, keep] = await insertRuns(s, anchored, [{ initialPage: true, recordedAt: minutes(CLEAN(), -60) }, { recordedAt: before(DAY_MS) }]);
      const [loose1, loose2] = await insertRuns(s, open, [{ recordedAt: before(2 * DAY_MS) }, { recordedAt: before(DAY_MS) }]);
      const summary = await clean(s, { apply: true });
      expect(summary.runIds.sort()).toEqual([loose1, loose2].sort());
      expect(await remaining(s)).toEqual([marker, keep].sort());
    });

    it("preserves later pages when a locked initial page is skipped, then cleans once it is released", async () => {
      const s = await scope();
      const policyId = await revokedPolicy(s);
      const [initial, later] = await insertRuns(s, policyId, [{ initialPage: true, recordedAt: before(5 * DAY_MS) }, { recordedAt: before(DAY_MS) }]);
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("select 1 from adscale_app.semantic_review_collection_runs where id = $1 for update", [initial]);
        const summary = await withTimeout(clean(s, { apply: true }));
        expect(summary).toMatchObject({ status: "ready", eligible: 0, deleted: 0, runIds: [] });   // locked marker skipped, later page kept
        expect(await remaining(s)).toEqual([initial, later].sort());
      } finally { await client.query("rollback"); client.release(); }
      expect(await clean(s, { apply: true })).toMatchObject({ eligible: 1, deleted: 1, runIds: [initial] });
      expect(await clean(s, { apply: true })).toMatchObject({ deleted: 1, runIds: [later] });
    });
  });

  describe("locks", () => {
    it("skips ledger rows locked by another transaction without waiting", async () => {
      const s = await scope();
      const policyId = await revokedPolicy(s);
      const [locked, free] = await insertRuns(s, policyId, [{ recordedAt: before(3 * DAY_MS) }, { recordedAt: before(2 * DAY_MS) }]);
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("select 1 from adscale_app.semantic_review_collection_runs where id = $1 for update", [locked]);
        expect(await withTimeout(clean(s, { apply: true }))).toMatchObject({ eligible: 1, deleted: 1, runIds: [free] });
        expect(await remaining(s)).toEqual([locked]);
      } finally { await client.query("rollback"); client.release(); }
    });

    it("takes no locks on observations, Trabalhos or quota: held row locks on them do not block it", async () => {
      const s = await scope();
      const policy = await repository.registerPolicy(policyInput(s, versions) as never, T0);
      await repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: true }, T0);
      const [workId] = await insertWorks(db, s, 1, { updatedAt: minutes(T0, 1) });
      await collectSemanticReview({ repository, enabled: true, now: minutes(T0, 5) });
      await repository.revokePolicy({ workspaceId: s.workspaceId, policyId: policy.id }, minutes(T0, 20));
      await db.update(runsTable).set({ initialPage: false }).where(eq(runsTable.workspaceId, s.workspaceId));
      const live = new Date(Date.now() + 3_600_000);
      const [old] = await insertRuns(s, policy.id, [{ recordedAt: new Date(live.getTime() - 31 * DAY_MS) }]);
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("select 1 from adscale_app.creative_work_items where id = $1 for update", [workId]);
        await client.query("select 1 from adscale_app.semantic_review_observations where work_item_id = $1 for update", [workId]);
        await client.query("select 1 from adscale_app.semantic_review_policies where id = $1 for update", [policy.id]);
        expect(await withTimeout(clean(s, { apply: true, now: live }))).toMatchObject({ status: "ready", deleted: 1, runIds: [old] });
      } finally { await client.query("rollback"); client.release(); }
    });
  });

  describe("effect on export history", () => {
    it("treats a failed initial page as insufficient and loses completeness once the initial page is retained away", async () => {
      const s = await scope();
      const policy = await repository.registerPolicy(policyInput(s, versions) as never, T0);
      await repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: true }, T0);
      await insertWorks(db, s, 1, { updatedAt: minutes(T0, 1) });
      for (let i = 0; i < 4; i += 1) await collectSemanticReview({ repository, enabled: true, now: minutes(T0, 5 + i) });
      const [observation] = await db.select().from(schema.semanticReviewObservations).where(eq(schema.semanticReviewObservations.workspaceId, s.workspaceId));
      const [real] = await db.select().from(runsTable).where(eq(runsTable.workspaceId, s.workspaceId));
      await db.delete(runsTable).where(eq(runsTable.workspaceId, s.workspaceId));
      await repository.revokePolicy({ workspaceId: s.workspaceId, policyId: policy.id }, minutes(T0, 20));
      const exporter = createSemanticReviewExportRepository(db);
      const now = new Date();
      const plan = { version: 1 as const, workspaceId: s.workspaceId, selectedAt: new Date(now.getTime() - DAY_MS).toISOString(), selectedBy: "synthetic-selector", selectedBeforeResults: true as const,
        entries: [{ reviewId: observation.id, familyId: "family-ledger", split: "holdout" as const, primary: true }] };
      const complete = async () => (await exporter.reconstruct({ authorization: {
        reference: "https://example.com/approvals/ledger-471", authorizedBy: "synthetic-owner", approvedAt: new Date(now.getTime() - 3_600_000).toISOString(),
        expiresAt: new Date(now.getTime() + 7 * DAY_MS).toISOString(), purpose: "blind_semantic_review_export", workspaceId: s.workspaceId,
        clientProfileIds: s.brandIds, reviewIds: [observation.id], planHash: semanticDigest(plan) }, plan, now })).collectionHistoryComplete;

      const [failedInitial] = await insertRuns(s, policy.id, [{ windowLower: real.windowLower, status: "failed", errorCode: "collection_page_failed", initialPage: true, recordedAt: before(10 * DAY_MS) }]);
      expect(await complete()).toBe(false);                               // a failed page alone does not prove the first window
      await db.delete(runsTable).where(eq(runsTable.id, failedInitial));
      const [initial] = await insertRuns(s, policy.id, [{ windowLower: real.windowLower, initialPage: true, recordedAt: before(10 * DAY_MS) }]);
      expect(await complete()).toBe(true);                                // collected initial page at the policy start
      expect(await clean(s, { apply: true })).toMatchObject({ deleted: 1, runIds: [initial] });
      expect(await complete()).toBe(false);                               // retention removed the marker: no false completeness
    });
  });

  describe("jev:retain cleanup", () => {
    const setup = async (open: boolean) => {
      const s = await scope();
      const policy = await repository.registerPolicy(policyInput(s, versions) as never, T0);
      await repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: true }, T0);
      if (!open) await repository.revokePolicy({ workspaceId: s.workspaceId, policyId: policy.id }, minutes(T0, 6));
      const realOld = new Date(Date.now() - 40 * DAY_MS);
      await insertRuns(s, policy.id, [{ recordedAt: realOld }, { recordedAt: new Date(realOld.getTime() - DAY_MS) }, { recordedAt: new Date() }]);
      return s;
    };
    type Cleanup = { observations: { status: string }; collectionRuns: Summary | null; quota: unknown };

    it("previews by default and deletes only with --apply, returning the collection-run summary", async () => {
      const s = await setup(false);
      const preview = (await retainMain(["cleanup", "--workspace", s.workspaceId])) as Cleanup;
      expect(preview.collectionRuns).toMatchObject({ mode: "dry_run", status: "ready", eligible: 2, deleted: 0 });
      expect(await remaining(s)).toHaveLength(3);
      const applied = (await retainMain(["cleanup", "--workspace", s.workspaceId, "--apply"])) as Cleanup;
      expect(applied.collectionRuns).toMatchObject({ mode: "apply", status: "ready", eligible: 2, deleted: 2 });
      expect(await remaining(s)).toHaveLength(1);
    });

    it("does not touch the ledger while an authorization window is open", async () => {
      const s = await setup(true);
      const blocked = (await retainMain(["cleanup", "--workspace", s.workspaceId, "--apply"])) as Cleanup;
      expect(blocked.observations.status).toBe("blocked_active_pilot_window");
      expect(blocked.collectionRuns).toBeNull();
      expect(await remaining(s)).toHaveLength(3);
    });

    it("rejects invalid arguments", async () => {
      await expect(retainMain(["cleanup"])).rejects.toThrow("invalid_arguments");
      await expect(retainMain(["cleanup", "--workspace", "x"])).rejects.toThrow("invalid_arguments");
    });
  });
});
