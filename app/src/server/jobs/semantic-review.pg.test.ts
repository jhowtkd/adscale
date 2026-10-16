/**
 * #472 — periodic Jev sweep through the REGISTERED Inngest function, real Postgres.
 *
 * Real repository, collector, processor and retention entries. HTTP is a controlled
 * `fetchImpl`; global fetch is a sentinel that must never run. Clock is injected and
 * isolated beyond residual policies (claimHermeticClock, shared advisory lock). Synthetic only.
 *
 *   TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *     npx vitest run --config config/vitest.config.ts src/server/jobs/semantic-review.pg.test.ts
 *
 * Absent TEST_DATABASE_URL skips the suite — a skip is NOT evidence.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import type { Pool } from "pg";

vi.mock("./client", () => ({
  inngest: { createFunction: (opts: unknown, fn: unknown) => ({ opts, fn }) },
}));

import * as schema from "../db/schema";
import { SEMANTIC_REVIEW_VERSIONS, createSemanticReviewRepository } from "../creative-work/semantic-review-repository";
import { SEMANTIC_MODEL, SEMANTIC_OPTIONS, SEMANTIC_QUESTIONS } from "../creative-work/semantic-review-offline";
import {
  DAY_MS, T0, assertSafeTestDatabaseUrl, claimHermeticClock, createScope, deleteScopes, insertWorks, minutes,
  openTestDatabase, policyInput, workSnapshot, type Scope, type TestDb,
} from "../creative-work/semantic-review-collection.pg-helpers";
import { createSemanticReviewObserverJob } from "./semantic-review";

const URL_UNDER_TEST = process.env.TEST_DATABASE_URL;
const versions = SEMANTIC_REVIEW_VERSIONS as unknown as Record<string, string>;
const CREDENTIAL = "controlled-credential-472";
const SECRET = "postgres://admin:hunter2@db.internal/prod";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Handler = (ctx: { step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => Promise<Row>;

function jevBody() {
  return {
    model: SEMANTIC_MODEL,
    answers: Object.fromEntries(SEMANTIC_QUESTIONS.map((question) => {
      const options = SEMANTIC_OPTIONS[question] as readonly string[];
      return [question, { type: "choice", choice: options[0], confidence: 0.9,
        probabilities: Object.fromEntries(options.map((option, index) => [option, index === 0 ? 1 : 0])) }];
    })),
    usage: { input_tokens: 120, output_tokens: 6 },
  };
}

describe.skipIf(!URL_UNDER_TEST)("semantic review periodic sweep (PostgreSQL, registered function)", () => {
  let db: TestDb;
  let pool: Pool;
  let releaseClock: () => Promise<void>;
  let repository: ReturnType<typeof createSemanticReviewRepository>;
  const scopes: Scope[] = [];
  const globalFetch = vi.fn(() => { throw new Error("global_fetch_forbidden"); });
  /** Mutable test clock; the sweep's deadline is clock()+20s. Collected rows are created at this time. */
  let current: Date;
  const clock = () => current;

  const obs = schema.semanticReviewObservations;
  const rows = async (s: Scope) => (await db.select().from(obs).where(eq(obs.workspaceId, s.workspaceId))) as Row[];
  const markers = async (s: Scope) => (await rows(s)).filter((r) => r.sendStartedAt !== null).length;
  const attempts = async (s: Scope) => (await db.select().from(schema.semanticReviewQuotaDays)
    .where(eq(schema.semanticReviewQuotaDays.workspaceId, s.workspaceId))).reduce((n, q) => n + q.attempts, 0);
  const byState = async (s: Scope, state: string) => (await rows(s)).filter((r) => r.state === state);

  /** Stub that records concurrency and send count; `during` can advance the clock or delay. */
  function controlledFetch(during?: (call: number) => Promise<void> | void) {
    const stats = { calls: 0, running: 0, maxRunning: 0 };
    const impl = (async () => {
      stats.calls += 1; stats.running += 1; stats.maxRunning = Math.max(stats.maxRunning, stats.running);
      try { await during?.(stats.calls); return new Response(JSON.stringify(jevBody()), { status: 200 }); }
      finally { stats.running -= 1; }
    }) as unknown as typeof fetch;
    return { impl, stats };
  }

  function job(overrides: Record<string, unknown> = {}) {
    const registered = createSemanticReviewObserverJob({ repository, enabled: true, credential: CREDENTIAL, clock,
      fetchImpl: controlledFetch().impl, diagnosticSink: () => {}, ...overrides } as never) as unknown as { opts: Row; fn: Handler };
    return registered;
  }
  const sweep = (overrides: Record<string, unknown> = {}) => job(overrides).fn({ step: { run: async (_name, fn) => fn() } });

  async function scope() {
    const created = await createScope(db, 1);
    scopes.push(created);
    return created;
  }
  /** Enabled synthetic policy + `count` works; collection is left to the sweep unless `collect`. */
  async function seed(s: Scope, count: number, { collect = true, policy: policyOverrides = {} }: { collect?: boolean; policy?: Row } = {}) {
    const policy = await repository.registerPolicy(policyInput(s, versions, policyOverrides) as never, T0);
    await repository.setPolicyEnabled({ workspaceId: s.workspaceId, policyId: policy.id, enabled: true }, T0);
    const workIds = await insertWorks(db, s, count, { updatedAt: minutes(T0, 1) });
    if (collect) {
      for (let i = 0; i < 10 && (await rows(s)).length < count; i += 1) {
        await repository.collectNextPage({ enabled: true, now: minutes(T0, 5 + i) });
      }
      expect(await rows(s)).toHaveLength(count);
    }
    return { policy, workIds };
  }

  beforeAll(async () => {
    ({ db, pool } = await openTestDatabase(assertSafeTestDatabaseUrl(URL_UNDER_TEST)));
    releaseClock = await claimHermeticClock(pool);
    repository = createSemanticReviewRepository(db);
  }, 120_000);
  beforeEach(() => {
    globalFetch.mockClear();
    vi.stubGlobal("fetch", globalFetch);
    vi.stubEnv("TYPESAFE_API_KEY", "");
    vi.stubEnv("JEV_OBSERVER_ENABLED", "");
    current = minutes(T0, 30);
  });
  afterEach(async () => {
    if (scopes.length) {
      await db.delete(schema.semanticReviewPolicies).where(inArray(schema.semanticReviewPolicies.workspaceId, scopes.map((s) => s.workspaceId)));
    }
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    expect(globalFetch).not.toHaveBeenCalled();
  });
  afterAll(async () => {
    if (!db) return;
    try { await deleteScopes(db, scopes); } finally { await releaseClock?.(); await pool.end(); }
  });

  it("is registered as one */5 cron with retries 0 and concurrency 1, running a single sweep step", async () => {
    const registered = job();
    expect(registered.opts).toMatchObject({ id: "semantic-review-observer", retries: 0, concurrency: 1 });
    expect(registered.opts.triggers).toEqual([{ cron: "*/5 * * * *" }]);
    const names: string[] = [];
    await registered.fn({ step: { run: async (name, fn) => { names.push(name); return fn(); } } });
    expect(names).toEqual(["semantic-review-sweep"]);
  });

  it("off: no policies loaded, no claim, no provider, no state change", async () => {
    const s = await scope();
    await seed(s, 2, { collect: false });
    const { impl, stats } = controlledFetch();
    const spy = vi.spyOn(repository, "collectNextPage");
    const summary = await sweep({ enabled: false, fetchImpl: impl });
    expect(summary).toMatchObject({ status: "disabled", expiration: null, collection: null, processing: [] });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(stats.calls).toBe(0);
    expect(await rows(s)).toHaveLength(0);
    expect(await attempts(s)).toBe(0);
  });

  it("zero policies: completes with no_policy, no send, no rows", async () => {
    const { impl, stats } = controlledFetch();
    const summary = await sweep({ fetchImpl: impl });
    expect(summary).toMatchObject({ status: "completed", collection: { status: "no_policy" }, processing: [] });
    expect(stats.calls).toBe(0);
  });

  it("revocation before the sweep: nothing is collected or sent for that policy", async () => {
    const s = await scope();
    const { policy } = await seed(s, 2);
    await repository.revokePolicy({ workspaceId: s.workspaceId, policyId: policy.id }, minutes(T0, 20));
    const { impl, stats } = controlledFetch();
    const summary = await sweep({ fetchImpl: impl });
    expect(stats.calls).toBe(0);
    expect(await markers(s)).toBe(0);
    expect(await attempts(s)).toBe(0);
    expect(summary.processing.every((p: Row) => p.sent === false)).toBe(true);
  });

  it("revocation between sends: the remaining queue is skipped without HTTP", async () => {
    const s = await scope();
    const { policy } = await seed(s, 3);
    const { impl, stats } = controlledFetch(async (call) => {
      if (call === 1) await repository.revokePolicy({ workspaceId: s.workspaceId, policyId: policy.id }, current);
    });
    await sweep({ fetchImpl: impl });
    expect(stats.calls).toBe(1);
    expect(await markers(s)).toBeLessThanOrEqual(2); // a marker may precede a local cancel, never a second HTTP
    expect(await attempts(s)).toBe(await markers(s));
  });

  it("queue larger than three: three sequential sends per sweep, the rest on later sweeps, each sent once", async () => {
    const s = await scope();
    await seed(s, 5);
    const { impl, stats } = controlledFetch(() => new Promise((resolve) => setTimeout(resolve, 10)));
    const first = await sweep({ fetchImpl: impl });
    expect(stats.calls).toBe(3);
    expect(stats.maxRunning).toBe(1);
    expect(first.processing).toHaveLength(3);
    expect(await markers(s)).toBe(3);
    expect(await attempts(s)).toBe(3);
    expect(await byState(s, "completed")).toHaveLength(3);
    expect(await byState(s, "queued")).toHaveLength(2);

    current = minutes(current, 1);
    await sweep({ fetchImpl: impl });
    expect(stats.calls).toBe(5);
    expect(await byState(s, "queued")).toHaveLength(0);
    expect(await attempts(s)).toBe(5);

    current = minutes(current, 1); // replay with nothing left
    const replay = await sweep({ fetchImpl: impl });
    expect(stats.calls).toBe(5);
    expect(await markers(s)).toBe(5);
    expect(replay.processing.every((p: Row) => !p.sent)).toBe(true);
  });

  it("one policy per sweep: two enabled workspaces are served alternately, never both in one sweep", async () => {
    const a = await scope();
    const b = await scope();
    await seed(a, 1);
    await seed(b, 1);
    const { impl, stats } = controlledFetch();
    const first = await sweep({ fetchImpl: impl });
    expect(stats.calls).toBe(1);
    const served = new Set(first.processing.map((p: Row) => p.workspaceId));
    expect(served.size).toBe(1);
    current = minutes(current, 1);
    const second = await sweep({ fetchImpl: impl });
    expect(stats.calls).toBe(2);
    expect([...served][0]).not.toBe(second.processing.find((p: Row) => p.sent)?.workspaceId);
  });

  it("replay and overlap: concurrent sweeps never send the same observation twice", async () => {
    const s = await scope();
    await seed(s, 4);
    const { impl, stats } = controlledFetch(() => new Promise((resolve) => setTimeout(resolve, 20)));
    await Promise.all([sweep({ fetchImpl: impl }), sweep({ fetchImpl: impl }), sweep({ fetchImpl: impl })]);
    const all = await rows(s);
    expect(all.filter((r) => r.sendStartedAt !== null).length).toBe(stats.calls);
    expect(stats.calls).toBeLessThanOrEqual(4);
    expect(new Set(all.filter((r) => r.sendStartedAt).map((r) => r.id)).size).toBe(stats.calls);
    expect(await attempts(s)).toBe(stats.calls);
    const before = stats.calls;
    current = minutes(current, 1);
    await sweep({ fetchImpl: impl });
    await sweep({ fetchImpl: impl });
    expect(stats.calls).toBeLessThanOrEqual(4);
    expect(stats.calls).toBeGreaterThanOrEqual(before);
    expect(await markers(s)).toBe(stats.calls);
  });

  it("shared 20 s deadline: sends stop when less than timeout+2s remain", async () => {
    const s = await scope();
    await seed(s, 3);
    // 12 s per send: send 1 at 0 s, send 2 at 12 s (8 s left >= 7 s), third blocked at 24 s.
    const { impl, stats } = controlledFetch(() => { current = new Date(current.getTime() + 12_000); });
    const summary = await sweep({ fetchImpl: impl });
    expect(stats.calls).toBe(2);
    expect(summary).toMatchObject({ status: "deferred", code: "budget_insufficient" });
    expect(await byState(s, "queued")).toHaveLength(1);
    expect(await markers(s)).toBe(2);
  });

  it("shared 20 s deadline: a send that would start with <7 s left is deferred before the marker", async () => {
    const s = await scope();
    await seed(s, 2);
    // 14 s for send 1 → 6 s left (< 5 s timeout + 2 s margin): the second never reaches the marker.
    const { impl, stats } = controlledFetch(() => { current = new Date(current.getTime() + 14_000); });
    const summary = await sweep({ fetchImpl: impl });
    expect(stats.calls).toBe(1);
    expect(summary.processing.at(-1)).toMatchObject({ status: "deferred", sent: false });
    expect(await markers(s)).toBe(1);
    expect(await attempts(s)).toBe(1);
    expect(await byState(s, "queued")).toHaveLength(1);
  });

  it("database failure in maintenance: safe failed summary, no throw, no provider call", async () => {
    const s = await scope();
    await seed(s, 1);
    const failing = { ...repository, listWorkspacesWithExpirableObservations: async () => { throw Object.assign(new Error(`${SECRET} ${CREDENTIAL}`), { code: "57014" }); } };
    const { impl, stats } = controlledFetch();
    const summary = await sweep({ repository: failing, fetchImpl: impl });
    expect(summary).toMatchObject({ status: "failed", phase: "expiration", code: "db_statement_timeout" });
    expect(JSON.stringify(summary)).not.toMatch(/hunter2|postgres:|controlled-credential/);
    expect(stats.calls).toBe(0);
    expect(await markers(s)).toBe(0);
  });

  it("database failure while claiming: no send, no marker, no quota, no raw message", async () => {
    const s = await scope();
    await seed(s, 1);
    const failing = { ...repository, claimObservation: async () => { throw Object.assign(new Error(SECRET), { code: "08006" }); } };
    const { impl, stats } = controlledFetch();
    const summary = await sweep({ repository: failing, fetchImpl: impl });
    expect(stats.calls).toBe(0);
    expect(JSON.stringify(summary)).not.toMatch(/hunter2|postgres:/);
    expect(await markers(s)).toBe(0);
    expect(await attempts(s)).toBe(0);
    expect((await byState(s, "queued")).length).toBe(1);
  });

  it("provider timeout: outcome_unknown with marker and quota kept; a later sweep never resends it", async () => {
    const s = await scope();
    await seed(s, 1);
    const hang = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })) as unknown as typeof fetch;
    const summary = await sweep({ fetchImpl: hang });
    expect(summary.processing[0]).toMatchObject({ status: "outcome_unknown", code: "timeout", sent: true });
    expect(hang).toHaveBeenCalledTimes(1);
    const [row] = await rows(s);
    expect(row).toMatchObject({ state: "outcome_unknown", errorCode: "timeout" });
    expect(row.sendStartedAt).not.toBeNull();
    expect(await attempts(s)).toBe(1);
    current = minutes(current, 1);
    await sweep({ fetchImpl: hang });
    expect(hang).toHaveBeenCalledTimes(1);
    expect((await rows(s))[0]).toMatchObject({ state: "outcome_unknown" });
  }, 30_000);

  it("provider unavailable (network error): no retry, outcome_unknown, Trabalho untouched", async () => {
    const s = await scope();
    const { workIds } = await seed(s, 2);
    const before = await Promise.all(workIds.map((id) => workSnapshot(db, id)));
    const down = vi.fn(async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
    const summary = await sweep({ fetchImpl: down });
    expect(down).toHaveBeenCalledTimes(2);
    expect(summary.processing.map((p: Row) => p.status)).toEqual(["outcome_unknown", "outcome_unknown", "no_observation"]);
    expect(await Promise.all(workIds.map((id) => workSnapshot(db, id)))).toEqual(before);
  });

  it("collection page always failing does not starve the existing queue", async () => {
    const s = await scope();
    const { policy } = await seed(s, 5);
    const failedCollect = {
      ...repository,
      collectNextPage: async () => ({ status: "failed", code: "collection_page_failed", workspaceId: s.workspaceId, policyId: policy.id,
        consulted: 0, eligible: 0, unique: 0, duplicates: 0, outOfScope: 0, invalid: 0, notSampled: 0, exclusions: {}, windowComplete: false }),
    };
    const { impl, stats } = controlledFetch();
    const first = await sweep({ repository: failedCollect, fetchImpl: impl });
    expect(first.collection).toMatchObject({ status: "failed", code: "collection_page_failed" });
    expect(stats.calls).toBe(3);
    current = minutes(current, 1);
    await sweep({ repository: failedCollect, fetchImpl: impl });
    expect(stats.calls).toBe(5);
    expect(await byState(s, "queued")).toHaveLength(0);
  });

  it("expiration is bounded to one page and cleanup never runs", async () => {
    const s = await scope();
    await seed(s, 1);
    const [template] = await rows(s);
    // 105 queued observations already past their 24h life, distinct identities.
    const stale = Array.from({ length: 105 }, () => ({ ...template, id: randomUUID(), semanticHash: randomUUID().replace(/-/g, "").repeat(2),
      expiresAt: minutes(current, -1), createdAt: minutes(current, -24 * 60 - 5) }));
    for (let i = 0; i < stale.length; i += 50) await db.insert(obs).values(stale.slice(i, i + 50) as never);
    // Retention fixtures that cleanup would delete: old terminal metadata and an old quota day.
    const [oldTerminal] = await db.insert(obs).values({ ...template, id: randomUUID(), semanticHash: "e".repeat(64), state: "completed",
      createdAt: new Date(current.getTime() - 45 * DAY_MS), expiresAt: new Date(current.getTime() - 44 * DAY_MS),
      finishedAt: new Date(current.getTime() - 44 * DAY_MS) } as never).returning();
    const oldDay = new Date(current.getTime() - 45 * DAY_MS).toISOString().slice(0, 10);
    await db.insert(schema.semanticReviewQuotaDays).values({ workspaceId: s.workspaceId, dayUtc: oldDay, attempts: 1 });
    // Pause the policy: only maintenance acts, no send.
    await repository.revokePolicy({ workspaceId: s.workspaceId, policyId: template.policyId }, minutes(T0, 20));

    const { impl, stats } = controlledFetch();
    const summary = await sweep({ fetchImpl: impl });
    expect(stats.calls).toBe(0);
    const expiredNow = (await rows(s)).filter((r) => r.errorCode === "queue_expired").length;
    expect(summary.expiration).not.toBeNull();
    expect(summary.expiration.expired).toBeLessThanOrEqual(100);
    expect(expiredNow).toBeGreaterThanOrEqual(1);
    expect(expiredNow).toBeLessThanOrEqual(100 + 5); // one 100-row page plus at most the processor's own skips
    // No cleanup: old terminal metadata and old quota days survive.
    expect(await db.select().from(obs).where(eq(obs.id, oldTerminal.id))).toHaveLength(1);
    expect((await db.select().from(schema.semanticReviewQuotaDays).where(eq(schema.semanticReviewQuotaDays.workspaceId, s.workspaceId)))
      .some((q) => q.dayUtc === oldDay)).toBe(true);
  });

  it("the sweep summary carries only counts, ids and safe codes (no snapshot, copy or provider response)", async () => {
    const s = await scope();
    await seed(s, 2);
    const summary = await sweep();
    const text = JSON.stringify(summary);
    expect(text).not.toMatch(/headline|synthetic|decisions|probabilities|usage|input_tokens|controlled-credential|Bearer|answers/i);
    expect(Object.keys(summary).sort()).toEqual(["collection", "expiration", "processing", "status"]);
    for (const p of summary.processing) expect(Object.keys(p).sort()).toEqual(expect.arrayContaining(["sent", "status", "workspaceId"]));
  });
});
