/**
 * #471 — persisted measurement evidence, against real PostgreSQL:
 *   - a failed collection page rolls back to its savepoint while the failed run (zero counters, safe code) is committed;
 *   - HTTP duration covers dispatch + body, never the wait for completion, and is null without a send.
 *
 *   TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *     npx vitest run --config config/vitest.config.ts src/server/creative-work/semantic-review-telemetry.pg.test.ts
 *
 * Absent TEST_DATABASE_URL skips the suite (a skip is NOT evidence). Synthetic rows only.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq, inArray } from "drizzle-orm";
import type { Pool } from "pg";
import * as schema from "../db/schema";
import { SEMANTIC_REVIEW_VERSIONS, createSemanticReviewRepository } from "./semantic-review-repository";
import { collectSemanticReview } from "./semantic-review-collector";
import { processSemanticReviewObservation } from "./semantic-review-processor";
import { SEMANTIC_MODEL, SEMANTIC_OPTIONS, SEMANTIC_QUESTIONS } from "./semantic-review-offline";
import {
  T0, assertSafeTestDatabaseUrl, claimHermeticClock, createScope, deleteScopes, insertWorks, minutes, openTestDatabase,
  policyInput, type Scope, type TestDb,
} from "./semantic-review-collection.pg-helpers";

const URL_UNDER_TEST = process.env.TEST_DATABASE_URL;
const versions = SEMANTIC_REVIEW_VERSIONS as unknown as Record<string, string>;
const CREDENTIAL = "controlled-credential-471-telemetry";

const jevBody = () => ({
  model: SEMANTIC_MODEL,
  answers: Object.fromEntries(SEMANTIC_QUESTIONS.map((question) => {
    const options = SEMANTIC_OPTIONS[question] as readonly string[];
    return [question, { type: "choice", choice: options[0], confidence: 0.9, probabilities: Object.fromEntries(options.map((option, i) => [option, i === 0 ? 1 : 0])) }];
  })),
  usage: { input_tokens: 120, output_tokens: 6 },
});

/** Mutable monotonic clock: it only moves when the test says so. */
function manualClock() {
  let value = 1_000;
  return { now: () => value, advance: (ms: number) => { value += ms; } };
}

describe.skipIf(!URL_UNDER_TEST)("persisted collection and HTTP measurement (PostgreSQL)", () => {
  let db: TestDb;
  let pool: Pool;
  let releaseClock: () => Promise<void>;
  let repository: ReturnType<typeof createSemanticReviewRepository>;
  const scopes: Scope[] = [];
  const globalFetch = vi.fn(() => { throw new Error("global_fetch_forbidden"); });
  const NOW = () => minutes(T0, 10);

  const scope = async () => { const s = await createScope(db, 1); scopes.push(s); return s; };
  async function enabledPolicy(s: Scope) {
    const policy = await repository.registerPolicy(policyInput(s, versions) as never, T0);
    await repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: true }, T0);
    return policy;
  }
  /** Collect (advancing the clock) until this policy is visited; other policies are expired by the hermetic clock. */
  async function collectPolicy(policyId: string, start: Date) {
    for (let i = 0; i < 10; i += 1) {
      const summary = await collectSemanticReview({ repository, enabled: true, now: minutes(start, i) });
      if (summary.policyId === policyId) return summary;
    }
    throw new Error("policy_not_visited");
  }
  const runs = (s: Scope) => db.select().from(schema.semanticReviewCollectionRuns)
    .where(eq(schema.semanticReviewCollectionRuns.workspaceId, s.workspaceId)).orderBy(asc(schema.semanticReviewCollectionRuns.recordedAt), asc(schema.semanticReviewCollectionRuns.id));
  const observations = (s: Scope) => db.select().from(schema.semanticReviewObservations).where(eq(schema.semanticReviewObservations.workspaceId, s.workspaceId));
  const policyRow = async (id: string) => (await db.select().from(schema.semanticReviewPolicies).where(eq(schema.semanticReviewPolicies.id, id)))[0];
  const cursor = (row: Awaited<ReturnType<typeof policyRow>>) => ({
    windowLower: row.windowLower, windowUpper: row.windowUpper, cursorUpdatedAt: row.cursorUpdatedAt, cursorWorkItemId: row.cursorWorkItemId, lastWindowUpper: row.lastWindowUpper,
  });
  const ZERO = { consulted: 0, eligible: 0, unique: 0, duplicates: 0, outOfScope: 0, invalid: 0, notSampled: 0 };

  /** Temporary trigger raising on inserts of one workspace into `table`. */
  async function installInsertFailure(s: Scope, table: "semantic_review_observations" | "semantic_review_collection_runs") {
    const name = `jev471_fail_${table.slice(16, 20)}_${s.workspaceId.replace(/-/g, "")}`;
    await pool.query(`create function adscale_app.${name}() returns trigger language plpgsql as $$ begin
      if new.workspace_id = '${s.workspaceId}' then raise exception 'jev471_forced_failure'; end if; return new; end $$`);
    await pool.query(`create trigger ${name} before insert on adscale_app.${table} for each row execute function adscale_app.${name}()`);
    return async () => {
      await pool.query(`drop trigger if exists ${name} on adscale_app.${table}`);
      await pool.query(`drop function if exists adscale_app.${name}()`);
    };
  }

  beforeAll(async () => {
    ({ db, pool } = await openTestDatabase(assertSafeTestDatabaseUrl(URL_UNDER_TEST)));
    releaseClock = await claimHermeticClock(pool);
    repository = createSemanticReviewRepository(db);
  }, 120_000);
  beforeEach(() => { globalFetch.mockClear(); vi.stubGlobal("fetch", globalFetch); });
  afterEach(async () => {
    if (scopes.length) await db.delete(schema.semanticReviewPolicies).where(inArray(schema.semanticReviewPolicies.workspaceId, scopes.map((s) => s.workspaceId)));
    vi.unstubAllGlobals();
    expect(globalFetch).not.toHaveBeenCalled();
  });
  afterAll(async () => {
    if (!db) return;
    try { await deleteScopes(db, scopes); } finally { await releaseClock?.(); await pool.end(); }
  });

  describe("collection run evidence", () => {
    it("rolls the failed page back to its savepoint but commits a failed run with zero counters and a safe code", async () => {
      const s = await scope();
      const policy = await enabledPolicy(s);
      await insertWorks(db, s, 3, { updatedAt: minutes(T0, 1) });
      const before = cursor(await policyRow(policy.id));
      expect(before).toEqual({ windowLower: null, windowUpper: null, cursorUpdatedAt: null, cursorWorkItemId: null, lastWindowUpper: null });
      const remove = await installInsertFailure(s, "semantic_review_observations");
      try {
        const summary = await collectPolicy(policy.id, minutes(T0, 60));
        expect(summary).toMatchObject({ status: "failed", code: "collection_page_failed" });
        expect(JSON.stringify(summary)).not.toMatch(/jev471_forced_failure|exception|trigger/i);
        expect(await observations(s)).toHaveLength(0);                           // page rolled back
        expect(cursor(await policyRow(policy.id))).toEqual(before);              // cursor/window not advanced
        expect((await policyRow(policy.id)).lastCollectedAt).not.toBeNull();     // scheduling still persisted
        const recorded = await runs(s);
        expect(recorded).toHaveLength(1);
        expect(recorded[0]).toMatchObject({ status: "failed", errorCode: "collection_page_failed", windowComplete: false, exclusions: {}, policyId: policy.id, initialPage: true, ...ZERO });
        expect(JSON.stringify(recorded)).not.toMatch(/jev471_forced_failure|exception|trigger/i);
      } finally { await remove(); }
      const recovered = await collectPolicy(policy.id, minutes(T0, 70));
      expect(recovered).toMatchObject({ status: "collected", unique: 3, windowComplete: true });
      expect(await observations(s)).toHaveLength(3);
      const all = await runs(s);
      expect(all.map((r) => [r.status, r.errorCode])).toEqual([["failed", "collection_page_failed"], ["collected", null]]);
      expect(all[1]).toMatchObject({ unique: 3, windowComplete: true });
    });

    it("keeps an empty successful run distinct from a failed run", async () => {
      const s = await scope();
      const policy = await enabledPolicy(s);
      const summary = await collectPolicy(policy.id, minutes(T0, 60));
      expect(summary).toMatchObject({ status: "collected", unique: 0, windowComplete: true });
      const recorded = await runs(s);
      expect(recorded).toHaveLength(1);
      expect(recorded[0]).toMatchObject({ status: "collected", errorCode: null, windowComplete: true, ...ZERO });
    });

    it("commits the page and its run together: a failing run insert leaves no observation, no cursor move, no run", async () => {
      const s = await scope();
      const policy = await enabledPolicy(s);
      await insertWorks(db, s, 3, { updatedAt: minutes(T0, 1) });
      const before = cursor(await policyRow(policy.id));
      const remove = await installInsertFailure(s, "semantic_review_collection_runs");
      try {
        const outcome = await collectPolicy(policy.id, minutes(T0, 60)).catch(() => "threw" as const);
        expect(outcome === "threw" || outcome.status === "failed").toBe(true);
        expect(await observations(s)).toHaveLength(0);
        expect(cursor(await policyRow(policy.id))).toEqual(before);
        expect(await runs(s)).toHaveLength(0);
      } finally { await remove(); }
    });
  });

  describe("HTTP duration persisted by the processor", () => {
    async function seedOne(s: Scope) {
      const policy = await enabledPolicy(s);
      await insertWorks(db, s, 1, { updatedAt: minutes(T0, 1) });
      await collectPolicy(policy.id, minutes(T0, 5));
      const [observation] = await observations(s);
      return observation.id;
    }
    const process = (s: Scope, observationId: string, over: Record<string, unknown>) => processSemanticReviewObservation({
      repository, workspaceId: s.workspaceId, observationId, enabled: true, credential: CREDENTIAL, clock: NOW, ...over,
    } as never);
    const persisted = async (id: string) => (await db.select().from(schema.semanticReviewObservations).where(eq(schema.semanticReviewObservations.id, id)))[0];

    /** Body delivered in two chunks; each pull advances the monotonic clock. */
    const slowFetch = (clock: ReturnType<typeof manualClock>, headersMs: number, chunkMs: number) => vi.fn(async () => {
      clock.advance(headersMs);
      const bytes = new TextEncoder().encode(JSON.stringify(jevBody()));
      const half = Math.floor(bytes.length / 2);
      const chunks = [bytes.slice(0, half), bytes.slice(half)];
      return new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
          clock.advance(chunkMs);
          const next = chunks.shift();
          if (next) controller.enqueue(next); else controller.close();
        },
      }), { status: 200 });
    }) as unknown as typeof fetch;

    it("includes dispatch and body time but not the wait before completion is recorded", async () => {
      const s = await scope();
      const id = await seedOne(s);
      const clock = manualClock();
      const slowFinish = { ...repository, finishObservation: async (input: Parameters<typeof repository.finishObservation>[0]) => {
        clock.advance(10_000);                       // queueing/lock wait before the completion write
        return repository.finishObservation(input);
      } };
      const fetchImpl = slowFetch(clock, 100, 25);
      const result = await process(s, id, { repository: slowFinish, fetchImpl, monotonicClock: clock.now });
      expect(result).toMatchObject({ status: "completed", sent: true });
      const row = await persisted(id);
      expect(row.state).toBe("completed");
      // 100ms to headers + 3 body pulls of 25ms (two chunks + close) → everything up to the body, nothing after.
      expect(row.httpElapsedMs).toBe(175);
      expect(row.httpElapsedMs).toBeLessThan(10_000);
    });

    it("persists an exact measured zero as 0, not null", async () => {
      const s = await scope();
      const id = await seedOne(s);
      const clock = manualClock();
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify(jevBody()), { status: 200 })) as unknown as typeof fetch;
      expect(await process(s, id, { fetchImpl, monotonicClock: clock.now })).toMatchObject({ status: "completed", sent: true });
      expect((await persisted(id)).httpElapsedMs).toBe(0);
    });

    it("persists the measured time of a send that failed", async () => {
      const s = await scope();
      const id = await seedOne(s);
      const clock = manualClock();
      const fetchImpl = vi.fn(async () => { clock.advance(70); throw new Error("network_down"); }) as unknown as typeof fetch;
      const result = await process(s, id, { fetchImpl, monotonicClock: clock.now });
      expect(result).toMatchObject({ sent: true });
      expect(result.status).not.toBe("completed");
      const row = await persisted(id);
      expect(row.sendStartedAt).not.toBeNull();
      expect(row.httpElapsedMs).toBe(70);
    });

    it("leaves duration null when nothing was sent", async () => {
      const s = await scope();
      const id = await seedOne(s);
      const clock = manualClock();
      const fetchImpl = vi.fn(async () => new Response("{}")) as unknown as typeof fetch;
      const result = await process(s, id, { enabled: false, fetchImpl, monotonicClock: clock.now });
      expect(result).toMatchObject({ sent: false });
      expect(fetchImpl).not.toHaveBeenCalled();
      const row = await persisted(id);
      expect(row.sendStartedAt).toBeNull();
      expect(row.httpElapsedMs).toBeNull();
    });
  });
});
